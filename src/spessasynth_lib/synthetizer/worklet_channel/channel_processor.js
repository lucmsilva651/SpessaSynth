import { NON_CC_INDEX_OFFSET, workletMessageType } from './worklet_channel.js';
import { midiControllers } from '../../midi_parser/midi_message.js';
import { generatorTypes } from '../../soundfont/chunk/generators.js';
import { getOscillatorValue } from './worklet_utilities/wavetable_oscillator.js';
import { modulatorSources } from '../../soundfont/chunk/modulators.js';
import { getModulated } from './worklet_utilities/worklet_modulator.js'
import {
    getVolEnvReleaseMultiplier,
    getVolumeEnvelopeValue,
} from './worklet_utilities/volume_envelope.js'
import {
    absCentsToHz,
    decibelAttenuationToGain,
    HALF_PI,
    timecentsToSeconds,
} from './worklet_utilities/unit_converter.js'
import { getLFOValue } from './worklet_utilities/lfo.js';
import { consoleColors } from '../../utils/other.js'

export const MIN_AUDIBLE_GAIN = 0.0001;

class ChannelProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        /**
         * @type {Object<number, Float32Array>}
         */
        this.samples = {};

        this.sampleTime = 1 / sampleRate;

        this.resetControllers();

        this.tuningRatio = 1;

        /**
         * @type {{depth: number, delay: number, rate: number}}
         */
        this.channelVibrato = {rate: 0, depth: 0, delay: 0};

        /**
         * contains all the voices currently playing
         * @type {WorkletVoice[]}
         */
        this.voices = [];

        /**
         * @param e {{data: WorkletMessage}}
         */
        this.port.onmessage = e => {
            const data = e.data.messageData;
            switch (e.data.messageType) {
                default:
                    break;

                // note off
                case workletMessageType.noteOff:
                    this.voices.forEach(v => {
                        if(v.midiNote !== data)
                        {
                            return;
                        }
                        v.releaseStartTime = currentTime;
                        v.isInRelease = true;
                    });
                    break;

                case workletMessageType.killNote:
                    this.voices = this.voices.filter(v => v.midiNote !== data);
                    break;

                case workletMessageType.noteOn:
                    data.forEach(voice => {
                        const exclusive = voice.generators[generatorTypes.exclusiveClass];
                        if(exclusive !== 0)
                        {
                            this.voices = this.voices.filter(v => v.generators[generatorTypes.exclusiveClass] !== exclusive);
                        }
                    })
                    this.voices.push(...data);
                    break;

                case workletMessageType.sampleDump:
                    this.samples[data.sampleID] = data.sampleData;
                    break;

                case workletMessageType.ccReset:
                    this.resetControllers();
                    break;

                case workletMessageType.ccChange:
                    this.midiControllers[data[0]] = data[1];
                    break;

                case workletMessageType.setChannelVibrato:
                    this.channelVibrato = data;
                    break;

                case workletMessageType.clearCache:
                    this.samples = [];
            }
        }
    }

    /**
     * @param inputs {Float32Array[][]}
     * @param outputs {Float32Array[][]}
     * @returns {boolean}
     */
    process(inputs, outputs) {
        const channels = outputs[0];
        const tempV = this.voices;
        this.voices = [];
        tempV.forEach(v => {
            this.renderVoice(v, channels[0], channels[1]);
            if(!v.finished)
            {
                this.voices.push(v);
            }
        });

        return true;
    }

    /**
     * @param voice {WorkletVoice}
     * @param outputLeft {Float32Array}
     * @param outputRight {Float32Array}
     */
    renderVoice(voice, outputLeft, outputRight)
    {
        if(!this.samples[voice.sample.sampleID])
        {
            voice.finished = true;
            return;
        }


        // MODULATORS are computed in getModulated if needed.

        // TUNING

        // calculate tuning
        let cents = getModulated(voice, generatorTypes.fineTune, this.midiControllers);
        let semitones = getModulated(voice, generatorTypes.coarseTune, this.midiControllers) + parseFloat(this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.channelTuning] >> 7);

        // calculate tuning by key
        cents += (voice.targetKey - voice.sample.rootKey) * getModulated(voice, generatorTypes.scaleTuning, this.midiControllers);

        // vibrato LFO
        const vibratoDepth = getModulated(voice, generatorTypes.vibLfoToPitch, this.midiControllers);
        if(vibratoDepth > 0)
        {
            const vibStart = voice.startTime + timecentsToSeconds(getModulated(voice, generatorTypes.delayVibLFO, this.midiControllers));
            const vibFreqHz = absCentsToHz(getModulated(voice, generatorTypes.freqVibLFO, this.midiControllers));
            const lfoVal = getLFOValue(vibStart, vibFreqHz, currentTime);
            if(lfoVal)
            {
                cents += lfoVal * vibratoDepth;
            }
        }

        // mod LFO
        const modPitchDepth = getModulated(voice, generatorTypes.modLfoToPitch, this.midiControllers);
        const modVolDepth = getModulated(voice, generatorTypes.modLfoToVolume, this.midiControllers);
        let modLfoCentibels = 0;
        if(modPitchDepth > 0 || modVolDepth > 0)
        {
            const modStart = voice.startTime + timecentsToSeconds(getModulated(voice, generatorTypes.delayModLFO, this.midiControllers));
            const modFreqHz = absCentsToHz(getModulated(voice, generatorTypes.freqModLFO, this.midiControllers));
            const modLfo = getLFOValue(modStart, modFreqHz, currentTime);
            if(modLfo) {
                cents += (modLfo * modPitchDepth);
                modLfoCentibels = (modLfo * modVolDepth) / 10
            }
        }

        // channel vibrato (GS NRPN)
        if(this.channelVibrato.depth > 0)
        {
            const channelVibrato = getLFOValue(voice.startTime + this.channelVibrato.delay, this.channelVibrato.rate, currentTime);
            if(channelVibrato)
            {
                cents += channelVibrato * this.channelVibrato.depth;
            }
        }

        // finally calculate the playback rate
        const playbackRate = Math.pow(2,(cents / 100 + semitones) / 12);

        // VOLUME ENVELOPE
        let attenuation, sustain, delay, attack, hold, decay, release;
        attenuation = decibelAttenuationToGain((getModulated(voice, generatorTypes.initialAttenuation, this.midiControllers) / 25) + modLfoCentibels);
        if(voice.isInRelease)
        {
            release = timecentsToSeconds(getModulated(voice, generatorTypes.releaseVolEnv, this.midiControllers));
        }
        else {
            sustain = attenuation * decibelAttenuationToGain(getModulated(voice, generatorTypes.sustainVolEnv, this.midiControllers) / 10);
            delay = timecentsToSeconds(getModulated(voice, generatorTypes.delayVolEnv, this.midiControllers));
            attack = timecentsToSeconds(getModulated(voice, generatorTypes.attackVolEnv, this.midiControllers));
            hold = timecentsToSeconds(getModulated(voice, generatorTypes.holdVolEnv, this.midiControllers) + ((60 - voice.midiNote) * getModulated(voice, generatorTypes.keyNumToVolEnvHold, this.midiControllers)));
            decay = timecentsToSeconds(getModulated(voice, generatorTypes.decayVolEnv, this.midiControllers) + ((60 - voice.midiNote) * getModulated(voice, generatorTypes.keyNumToVolEnvDecay, this.midiControllers)));
        }

        // PANNING
        const pan = ( (Math.max(-500, Math.min(500, getModulated(voice, generatorTypes.pan, this.midiControllers) )) + 500) / 1000) ; // 0 to 1
        const panLeft = Math.cos(HALF_PI * pan);
        const panRight = Math.sin(HALF_PI * pan);


        // LOWPASS
        // const filterQ = getModulated(voice, generatorTypes.initialFilterQ, this.midiControllers) - 3.01; // polyphone????
        // const filterQgain = Math.pow(10, filterQ / 20);
        // const filterFcHz = absCentsToHz(getModulated(voice, generatorTypes.initialFilterFc, this.midiControllers));
        // // calculate coefficients
        // const theta = 2 * Math.PI * filterFcHz / sampleRate;
        // let a0, a1, a2, b1, b2;
        // if (filterQgain <= 0)
        // {
        //     a0 = 1;
        //     a1 = 0;
        //     a2 = 0;
        //     b1 = 0;
        //     b2 = 0;
        // }
        // else
        // {
        //     const dTmp = Math.sin(theta) / (2 * filterQgain);
        //     if (dTmp <= -1.0)
        //     {
        //         a0 = 1;
        //         a1 = 0;
        //         a2 = 0;
        //         b1 = 0;
        //         b2 = 0;
        //     }
        //     else
        //     {
        //         const beta = 0.5 * (1 - dTmp) / (1 + dTmp);
        //         const gamma = (0.5 + beta) * Math.cos(theta);
        //         a0 = (0.5 + beta - gamma) / 2;
        //         a1 = 2 * a0;
        //         a2 = a0;
        //         b1 = -2 * gamma;
        //         b2 = 2 * beta;
        //     }
        // }

        // SYNTHESIS
        let actualTime = currentTime;
        for (let outputSampleIndex = 0; outputSampleIndex < outputLeft.length; outputSampleIndex++) {

            // Read the sample
            let sample = getOscillatorValue(
                voice,
                this.samples[voice.sample.sampleID],
                playbackRate
            );

            // apply the volenv
            if(voice.isInRelease)
            {
                voice.volEnvGain = attenuation * getVolEnvReleaseMultiplier(release, actualTime - voice.releaseStartTime);
            }
            else {
                voice.currentGain = getVolumeEnvelopeValue(
                    delay,
                    attack,
                    attenuation,
                    hold,
                    sustain,
                    decay,
                    voice.startTime,
                    actualTime);

                voice.volEnvGain = voice.currentGain;
            }
            if(voice.volEnvGain < 0)
            {
                voice.finished = true;
                return;
            }

            sample *= voice.volEnvGain;

            // pan the voice and write out
            outputLeft[outputSampleIndex] += sample * panLeft;
            outputRight[outputSampleIndex] += sample * panRight;

            actualTime += this.sampleTime;
        }
    }

    resetControllers()
    {
        // Create an Int16Array with 127 elements
        this.midiControllers = new Int16Array(146);
        this.midiControllers[midiControllers.mainVolume] = 100 << 7;
        this.midiControllers[midiControllers.expressionController] = 127 << 7;
        this.midiControllers[midiControllers.pan] = 64 << 7;

        this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel] = 8192;
        this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange] = 2 << 7;
        this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.channelPressure] = 127 << 7;
        this.midiControllers[NON_CC_INDEX_OFFSET + modulatorSources.channelTuning] = 0;
    }

}


registerProcessor("worklet-channel-processor", ChannelProcessor);
console.log("%cProcessor succesfully registered!", consoleColors.recognized);
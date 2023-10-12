import { decibelAttenuationToGain, timecentsToSeconds } from './unit_converter.js'
import { generatorTypes } from '../../../soundfont/chunk/generators.js'

const DB_SILENCE = 100;
/**
 * @param voice {WorkletVoice}
 * @param audioBuffer {Float32Array}
 * @param currentTime {number}
 * @param centibelOffset {number}
 * @param sampleTime {number} single sample time, usually 1 / 44100 of a second
 */
export function applyVolumeEnvelope(voice, audioBuffer, currentTime, centibelOffset, sampleTime)
{
    // calculate values
    let decibelOffset = centibelOffset / 10;

    // calculate env times
    let attack = timecentsToSeconds(voice.modulatedGenerators[generatorTypes.attackVolEnv]);
    let decay = timecentsToSeconds(voice.modulatedGenerators[generatorTypes.decayVolEnv] + ((60 - voice.midiNote) * voice.modulatedGenerators[generatorTypes.keyNumToVolEnvDecay]));

    // calculate absolute times
    let attenuation = voice.modulatedGenerators[generatorTypes.initialAttenuation] / 25;
    let release = timecentsToSeconds(voice.modulatedGenerators[generatorTypes.releaseVolEnv]);
    let sustain = attenuation + voice.modulatedGenerators[generatorTypes.sustainVolEnv] / 10;
    let delayEnd  = timecentsToSeconds(voice.modulatedGenerators[generatorTypes.delayVolEnv]) + voice.startTime;
    let attackEnd = attack + delayEnd;
    let holdEnd = timecentsToSeconds(voice.modulatedGenerators[generatorTypes.holdVolEnv] + ((60 - voice.midiNote) * voice.modulatedGenerators[generatorTypes.keyNumToVolEnvHold])) + attackEnd;
    let decayEnd = decay + holdEnd;

    if(voice.isInRelease)
    {
        let elapsedRelease = currentTime - voice.releaseStartTime;
        let dbDifference = DB_SILENCE - voice.releaseStartDb;
        let db;
        for (let i = 0; i < audioBuffer.length; i++) {
            db = (elapsedRelease / release) * dbDifference + voice.releaseStartDb;
            audioBuffer[i] = decibelAttenuationToGain(db + decibelOffset) * audioBuffer[i];
            elapsedRelease += sampleTime;
        }

        if(db >= DB_SILENCE)
        {
            voice.finished = true;
        }
        return;
    }
    let currentFrameTime = currentTime;
    let dbAttenuation;
    for (let i = 0; i < audioBuffer.length; i++) {
        if(currentFrameTime < delayEnd)
        {
            // we're in the delay phase
            dbAttenuation = DB_SILENCE;
        }
        else if(currentFrameTime < attackEnd)
        {
            // we're in the attack phase
            // Special case: linear instead of exponential
            const elapsed = (attackEnd - currentFrameTime) / attack;
            audioBuffer[i] = audioBuffer[i] * (1 - elapsed) * decibelAttenuationToGain(attenuation);
            currentFrameTime += sampleTime;
            dbAttenuation = elapsed * (attenuation - DB_SILENCE) + DB_SILENCE;
            continue;
        }
        else if(currentFrameTime < holdEnd)
        {
            dbAttenuation = attenuation;
        }
        else if(currentFrameTime < decayEnd)
        {
            // we're in the decay phase
            dbAttenuation = (1 - (decayEnd - currentFrameTime) / decay) * (sustain - attenuation) + attenuation;
        }
        else
        {
            dbAttenuation = sustain;
        }

        // apply gain and advance the time
        audioBuffer[i] = audioBuffer[i] * decibelAttenuationToGain(dbAttenuation + decibelOffset);
        currentFrameTime += sampleTime;
    }
    voice.currentAttenuationDb = dbAttenuation;
}
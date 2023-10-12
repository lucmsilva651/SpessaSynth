import { DEFAULT_GAIN, Synthetizer } from '../../../spessasynth_lib/synthetizer/synthetizer.js'
import {MidiChannel} from "../../../spessasynth_lib/synthetizer/native_system/midi_channel.js";
import { getLoopSvg, getMuteSvg, getVolumeSvg } from '../icons.js'
import { ShiftableByteArray } from '../../../spessasynth_lib/utils/shiftable_array.js';
import { Meter } from './synthui_meter.js'
import { midiPatchNames } from '../../../spessasynth_lib/utils/other.js'
import { midiControllers } from '../../../spessasynth_lib/midi_parser/midi_message.js'
import { SequencePlayer } from '../../sequence_recorder/sequence_player.js'
import { SequenceRecorder } from '../../sequence_recorder/sequence_recorder.js'

export class SynthetizerUI
{
    /**
     * Creates a new instance of synthetizer UI
     * @param colors {string[]}
     */
    constructor(colors) {
        this.channelColors = colors;
        const wrapper = document.getElementById("synthetizer_controls");
        this.uiDiv = document.createElement("div");
        this.uiDiv.classList.add("wrapper");
        wrapper.appendChild(this.uiDiv);
        this.uiDiv.style.visibility = "hidden";
        /**
         * @type {SequenceRecorder}
         */
        this.recorder = undefined;
        setTimeout(() => this.uiDiv.style.visibility = "visible", 500);
    }

    createMainSynthController()
    {
        // controls wrapper
        let controlsWrapper = document.createElement("div");
        controlsWrapper.classList.add("controls_wrapper");

        /**
         * Voice meter
         * @type {Meter}
         */
        this.voiceMeter = new Meter("#206", "Voices: ", 0, this.synth.voiceCap);
        this.voiceMeter.bar.classList.add("voice_meter_bar_smooth");

        /**
         * Volume controller
         * @type {Meter}
         */
        this.volumeController = new Meter("#206", "Volume: ", 0, 100, true, v => {
            this.synth.setMainVolume(Math.round(v) / 100);
        });
        this.volumeController.bar.classList.add("voice_meter_bar_smooth");

        /**
         * Pan controller
         * @type {Meter}
         */
        this.panController = new Meter("#206", "Pan: ", -1, 1, true, v => {
            // use roland gs master pan
            this.synth.systemExclusive(new ShiftableByteArray([0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x06, ((v + 1) / 2) * 127]));
        });
        this.panController.bar.classList.add("voice_meter_bar_smooth");

        /**
         * Transpose controller
         * @type {Meter}
         */
        this.transposeController = new Meter("#206", "Transpose: ", -12, 12, true, v => {
            // limit to half semitone precision
            this.synth.transpose(Math.round(v * 2 ) / 2);
            this.transposeController.update(Math.round(v * 2) / 2)
        });
        this.transposeController.bar.classList.add("voice_meter_bar_smooth");
        this.transposeController.update(0);

        // note killer
        let midiPanicButton = document.createElement("button");
        midiPanicButton.innerText = "MIDI Panic";
        midiPanicButton.classList.add("synthui_button");
        midiPanicButton.onclick = () => this.synth.stopAll(true);

        let resetCCButton = document.createElement("button");
        resetCCButton.innerText = "System Reset";
        resetCCButton.classList.add("synthui_button");
        resetCCButton.onclick = () => this.synth.resetControllers();

        // create the main controller now, to give the button a variable to work with
        let controller = document.createElement("div");
        controller.classList.add("synthui_controller");
        this.uiDiv.appendChild(controller);

        // channel controller shower
        let showControllerButton = document.createElement("button");
        showControllerButton.innerText = "Synthesizer controller";
        showControllerButton.classList.add("synthui_button");
        showControllerButton.onclick = () => {
            controller.classList.toggle("synthui_controller_show");
            controlsWrapper.classList.toggle("controls_wrapper_show");
        }

        // black midi mode toggle
        const highPerfToggle = document.createElement("button");
        highPerfToggle.innerText = "Black MIDI mode";
        highPerfToggle.classList.add("synthui_button");
        highPerfToggle.onclick = () => {
            this.synth.highPerformanceMode = !this.synth.highPerformanceMode;
        }

        const recordingButton = document.createElement("button");
        recordingButton.innerText = "Start Recording";
        recordingButton.classList.add("synthui_button");
        recordingButton.onclick = () => {
            if(this.recorder)
            {
                recordingButton.innerText = "Start Recording";
                this.recorder.stopRecording();
                new SequencePlayer(this.synth, this.recorder).play();
                this.recorder = undefined;
            }
            else
            {
                recordingButton.innerText = "Stop Recording";
                this.recorder = new SequenceRecorder(this.synth);
                let targetCh = 0;
                if(this.keyboard)
                {
                    targetCh = this.keyboard.channel;
                }
                this.recorder.startRecording(targetCh);
            }
        }

        this.recordingButton = recordingButton;

        // meters
        controlsWrapper.appendChild(this.volumeController.div);
        controlsWrapper.appendChild(this.panController.div);
        controlsWrapper.appendChild(this.transposeController.div);
        // buttons
        controlsWrapper.appendChild(midiPanicButton);
        controlsWrapper.appendChild(resetCCButton);
        controlsWrapper.appendChild(recordingButton);
        controlsWrapper.appendChild(highPerfToggle);
        // main synth div
        this.uiDiv.appendChild(this.voiceMeter.div);
        this.uiDiv.appendChild(showControllerButton);
        controller.appendChild(controlsWrapper);
    }

    /**
     * @param keyboard {MidiKeyboard}
     */
    connectKeyboard(keyboard)
    {
        this.keyboard = keyboard;
    }

    updateVoicesAmount()
    {
        this.voiceMeter.update(this.synth.voicesAmount);

        for(let i = 0; i < this.controllers.length; i++)
        {
            // update channel
            this.controllers[i].voiceMeter.update(this.synth.midiChannels[i].voicesAmount);
        }
        this.volumeController.update((this.synth.volumeController.gain.value * (1 / DEFAULT_GAIN)) * 100);
        this.panController.update(this.synth.panController.pan.value);
    }

    createChannelControllers()
    {
        const dropdownDiv = this.uiDiv.getElementsByClassName("synthui_controller")[0];

        /**
         * @type {ChannelController[]}
         */
        this.controllers = [];
        let num = 0;
        for(const chan of this.synth.midiChannels)
        {
            const controller = this.createChannelController(chan, num);
            this.controllers.push(controller);
            dropdownDiv.appendChild(controller.controller);
            num++;
        }

        // add event listeners
        this.synth.eventHandler.addEvent("programchange", e =>
        {
            if(this.synth.midiChannels[e.channel].lockPreset)
            {
                return;
            }
            this.controllers[e.channel].preset.value = JSON.stringify([e.preset.bank, e.preset.program]);
        });

        this.synth.eventHandler.addEvent("controllerchange", e => {
            const controller = e.controllerNumber;
            const channel = e.channel;
            const value = e.controllerValue;
            switch (controller)
            {
                default:
                    break;

                case midiControllers.expressionController:
                    // expression
                    this.controllers[channel].expression.update(Math.round(value));
                    break;

                case midiControllers.mainVolume:
                    // volume
                    this.controllers[channel].volume.update(Math.round(value));
                    break;

                case midiControllers.pan:
                    // pan
                    this.controllers[channel].pan.update((value - 63) / 64);
                    break;

                case midiControllers.modulationWheel:
                    // mod wheel
                    this.controllers[channel].mod.update(value);
                    break;

                case midiControllers.effects3Depth:
                    // chorus
                    this.controllers[channel].chorus.update(value);
                    break;
            }
        });

        this.synth.eventHandler.addEvent("pitchwheel", e => {
            const val = (e.MSB << 7) | e.LSB;
            // pitch wheel
            this.controllers[e.channel].pitchWheel.update(val - 8192);
        });

        this.synth.eventHandler.addEvent("drumchange", e => {
            if(this.synth.midiChannels[e.channel].lockPreset)
            {
                return;
            }
            this.reloadSelector(this.controllers[e.channel].preset, e.isDrumChannel ? this.percussionList : this.instrumentList);
        });

        setInterval(this.updateVoicesAmount.bind(this), 100);
    }

    /**
     * @typedef {{
     *     controller: HTMLDivElement,
     *     voiceMeter: Meter,
     *     pitchWheel: Meter,
     *     pan: Meter,
     *     expression: Meter,
     *     mod: Meter,
     *     chorus: Meter,
     *     preset: HTMLSelectElement,
     *     presetReset: HTMLDivElement
     * }} ChannelController
     */

    /**
     * Creates a new channel controller ui
     * @param channel {MidiChannel}
     * @param channelNumber {number}
     * @returns {ChannelController}
     */
    createChannelController(channel, channelNumber)
    {
        // controller
        const controller = document.createElement("div");
        controller.classList.add("channel_controller");

        // voice meter
        const voiceMeter = new Meter(this.channelColors[channelNumber],
            "Voices: ",
            0,
            100);
        voiceMeter.bar.classList.add("voice_meter_bar_smooth");
        controller.appendChild(voiceMeter.div);

        // pitch wheel
        const pitchWheel = new Meter(this.channelColors[channelNumber],
            "Pitch: ",
            -8192,
            8192,
            true,
            val => {
                val = Math.round(val) + 8192;
                // get bend values
                const msb = val >> 7;
                const lsb = val & 0x7F;
                this.synth.pitchWheel(channelNumber, msb, lsb);
        });
        pitchWheel.update(0);
        controller.appendChild(pitchWheel.div);

        // pan controller
        const pan = new Meter(this.channelColors[channelNumber],
            "Pan: ",
            -1,
            1,
            true,
            val => {
                this.synth.controllerChange(channelNumber, midiControllers.pan, (val / 2 + 0.5) * 127);
            });
        pan.update(0);
        controller.appendChild(pan.div);

        // expression controller
        const expression = new Meter(this.channelColors[channelNumber],
            "Expression: ",
            0,
            127,
            true,
            val => {
                this.synth.controllerChange(channelNumber, midiControllers.expressionController, val);
                expression.update(Math.round(val));
            });
        expression.update(127);
        controller.appendChild(expression.div);

        // volume controller
        const volume = new Meter(this.channelColors[channelNumber],
            "Volume: ",
            0,
            127,
            true,
            val => {
            this.synth.controllerChange(channelNumber, midiControllers.mainVolume, val);
            volume.update(Math.round(val));
            });
        volume.update(100);
        controller.appendChild(volume.div);

        // modulation wheel
        const modulation = new Meter(this.channelColors[channelNumber],
            "Mod Wheel: ",
            0,
            127,
            true,
            val => {
                this.synth.controllerChange(channelNumber, midiControllers.modulationWheel, val);
            });
        modulation.update(0);
        controller.appendChild(modulation.div);

        // chorus
        const chorus = new Meter(this.channelColors[channelNumber],
            "Chorus: ",
            0,
            127,
            true,
            val => {
                this.synth.controllerChange(channelNumber, midiControllers.effects3Depth, val);
            });
        chorus.update(0);
        controller.appendChild(chorus.div);

        // create it here so we can use it in the callback function
        const presetReset = document.createElement("div");

        // preset controller
        const presetSelector = this.createSelector((
            channel.percussionChannel ? this.percussionList : this.instrumentList
        ),
            presetName => {
            const data = JSON.parse(presetName);
            this.synth.midiChannels[channelNumber].lockPreset = false;
            this.synth.controllerChange(channelNumber, midiControllers.bankSelect, data[0]);
            this.synth.programChange(channelNumber, data[1]);
            presetSelector.classList.add("locked_selector");
            this.synth.midiChannels[channelNumber].lockPreset = true;
        }
        );
        controller.appendChild(presetSelector);

        // preset reset
        presetReset.innerHTML = getLoopSvg(32);
        presetReset.classList.add("controller_element");
        presetReset.classList.add("voice_reset");
        presetReset.onclick = () => {
            this.synth.midiChannels[channelNumber].lockPreset = false;
            presetSelector.classList.remove("locked_selector");
        }
        controller.appendChild(presetReset);

        // mute button
        const muteButton = document.createElement("div");
        muteButton.innerHTML = getVolumeSvg(32);
        muteButton.classList.add("controller_element");
        muteButton.classList.add("mute_button");
        muteButton.onclick = () => {
            if(this.synth.midiChannels[channelNumber].gainController.gain.value === 0)
            {
                this.synth.midiChannels[channelNumber].unmuteChannel();
                muteButton.innerHTML = getVolumeSvg(32);
            }
            else
            {
                this.synth.midiChannels[channelNumber].muteChannel();
                muteButton.innerHTML = getMuteSvg(32);
            }
        }
        controller.appendChild(muteButton);

        return {
            controller: controller,
            voiceMeter: voiceMeter,
            pitchWheel: pitchWheel,
            pan: pan,
            expression: expression,
            volume: volume,
            mod: modulation,
            chorus: chorus,
            preset: presetSelector,
            presetReset: presetReset
        };

    }

    /**
     * Connects the synth to UI
     * @param synth {Synthetizer}
     */
    connectSynth(synth)
    {
        this.synth = synth;

        this.getInstrumentList();

        this.createMainSynthController();
        this.createChannelControllers();

        document.addEventListener("keydown", e => {
            switch (e.key.toLowerCase())
            {
                case "s":
                    e.preventDefault();
                    const controller = this.uiDiv.getElementsByClassName("synthui_controller")[0];
                    controller.classList.toggle("synthui_controller_show");
                    controller.getElementsByClassName("controls_wrapper")[0].classList.toggle("controls_wrapper_show");
                    break;

                case "b":
                    e.preventDefault();
                    this.synth.highPerformanceMode = !this.synth.highPerformanceMode;
                    break;

                case "r":
                    if(e.shiftKey)
                    {
                        return
                    }
                    if(this.recorder)
                    {
                        this.recordingButton.innerText = "Start Recording";
                        this.recorder.stopRecording();
                        new SequencePlayer(this.synth, this.recorder).play();
                        this.recorder = undefined;
                    }
                    else
                    {
                        this.recordingButton.innerText = "Stop Recording";
                        this.recorder = new SequenceRecorder(this.synth);
                        let targetCh = 0;
                        if(this.keyboard)
                        {
                            targetCh = this.keyboard.channel;
                        }
                        this.recorder.startRecording(targetCh);
                    }
                    break;

                case "backspace":
                    e.preventDefault();
                    this.synth.stopAll(true);
                    break;
            }
        })
    }

    /**
     * Creates a new selector
     * @param elements  {{name: string, program: number, bank: number}[]}
     * @param editCallback {function(string)}
     * @returns {HTMLSelectElement}
     */
    createSelector(elements,
                   editCallback)
    {
        const mainDiv = document.createElement("select");
        mainDiv.classList.add("voice_selector");
        mainDiv.classList.add("controller_element");

        this.reloadSelector(mainDiv, elements);

        mainDiv.onchange = () => editCallback(mainDiv.value);

        return mainDiv;
    }

    /**
     * @param selector {HTMLSelectElement}
     * @param elements {{name: string, program: number, bank: number}[]}
     */
    reloadSelector(selector, elements)
    {
        selector.innerHTML = "";
        let lastProgram = -20;

        let currentGroup; // current group (optgroup element) or if single preset for program, the select element
        let isInGroup = false; // controls how we should format the preset name

        for(const preset of elements)
        {
            const bank = preset.bank;
            const program = preset.program;

            // create a new group
            if(program !== lastProgram)
            {
                lastProgram = program;
                // unless there's only 1 preset for this program
                if(elements.filter(e => e.program === lastProgram).length > 1)
                {
                    isInGroup = true;
                    currentGroup = document.createElement("optgroup");
                    currentGroup.label = `${lastProgram}. ${midiPatchNames[lastProgram]}`;
                    selector.appendChild(currentGroup);
                }
                else
                {
                    isInGroup = false;
                    currentGroup = selector;
                }
            }

            const element = document.createElement("option");
            element.classList.add("selector_option");
            if(isInGroup)
            {
                element.innerText = `${preset.program}.${preset.bank}. ${preset.name}`;
            }
            else
            {
                element.innerText = `${preset.program}. ${preset.name}`;
            }
            element.value = JSON.stringify([bank, program]);
            currentGroup.appendChild(element);
        }

    }

    getInstrumentList()
    {
        /**
         * @type {{name: string, program: number, bank: number}[]}
         */
        this.instrumentList = this.synth.soundFont.presets.filter(p => p.bank !== 128)
            .sort((a, b) => {
                if(a.program === b.program)
                {
                    return a.bank - b.bank;
                }
                return a.program - b.program;
            })
            .map(p => {
                return {
                    name: p.presetName,
                    bank: p.bank,
                    program: p.program
                };
            });

        /**
         * @type {{name: string, program: number, bank: number}[]}
         */
        this.percussionList = this.synth.soundFont.presets.filter(p => p.bank === 128)
            .sort((a, b) => a.program - b.program)
            .map(p => {
                return {
                    name: p.presetName,
                    bank: p.bank,
                    program: p.program
                };
            })
    }

    reloadSelectors()
    {
        this.getInstrumentList();
        this.controllers.forEach((controller, i) => {
            this.reloadSelector(controller.preset, this.synth.midiChannels[i].percussionChannel ? this.percussionList : this.instrumentList);
        })
    }
}
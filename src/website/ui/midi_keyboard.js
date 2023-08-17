import {Synthetizer} from "../../spessasynth_lib/synthetizer/synthetizer.js";
import { MIDIDeviceHandler } from '../../spessasynth_lib/midi_handler/midi_device_handler.js'

const KEYBOARD_VELOCITY = 126;

export class MidiKeyboard
{
    /**
     * Creates a new midi keyboard(keyboard)
     * @param channelColors {Array<string>}
     * @param synth {Synthetizer}
     * @param handler {MIDIDeviceHandler}
     */
    constructor(channelColors, synth, handler) {
        this.mouseHeld = false;
        this.heldKeys = [];

        document.onmousedown = () => this.mouseHeld = true;
        document.onmouseup = () => {
            this.mouseHeld = false;
            for(let key of this.heldKeys)
            {
                // user note off
                this.releaseNote(key);
                this.synth.noteOff(this.channel, key);
            }
        }

        // hold pedal on
        document.addEventListener("keydown", e =>{
            if(e.key === "Shift")
            {
                this.synth.controllerChange(this.channel, "Sustain Pedal", 127);
                this.keyboard.style.filter = "brightness(0.5)";
            }
        });

        // hold pedal off
        document.addEventListener("keyup", e => {
            if(e.key === "Shift")
            {
                this.synth.controllerChange(this.channel, "Sustain Pedal", 0);
                this.keyboard.style.filter = "";
            }
        });

        this.synth = synth;
        this.channel = 0;

        this.channelColors = channelColors;

        /**
         * @type {HTMLDivElement}
         */
        this.keyboard = document.getElementById("keyboard");

        /**
         *
         * @type {HTMLDivElement[]}
         */
        this.keys = [];

        /**
         * @type {string[][]}
         */
        this.keyColors = [];

        // create keyboard
        function isBlackNoteNumber(noteNumber) {
                let pitchClass = noteNumber % 12;
                return pitchClass === 1 || pitchClass === 3 || pitchClass === 6 || pitchClass === 8 || pitchClass === 10;
        }
        for (let midiNote = 0; midiNote < 128; midiNote++) {
            let keyElement = document.createElement("div");
            keyElement.classList.add("key");
            keyElement.id = `note${midiNote}`;
            keyElement.onmouseover = () => {
                if(!this.mouseHeld)
                {
                    return
                }

                // user note on
                this.heldKeys.push(midiNote);
                this.pressNote(midiNote, this.channel, KEYBOARD_VELOCITY, 1, 1);
                this.synth.noteOn(this.channel, midiNote, KEYBOARD_VELOCITY, true);
            }

            keyElement.onmousedown = () =>
            {
                // user note on
                this.heldKeys.push(midiNote);
                this.pressNote(midiNote, this.channel, KEYBOARD_VELOCITY, 1, 1);
                this.synth.noteOn(this.channel, midiNote, KEYBOARD_VELOCITY, true);
            }

            keyElement.onmouseout = () => {
                // user note off
                this.heldKeys.splice(this.heldKeys.indexOf(midiNote), 1);
                this.releaseNote(midiNote);
                this.synth.noteOff(this.channel, midiNote);
            };
            keyElement.onmouseleave = keyElement.onmouseup;
            let isBlack = isBlackNoteNumber(midiNote);
            if(isBlack)
            {
                // short note
                keyElement.classList.add("sharp_key");
            }
            else
            {
                // long note
                keyElement.classList.add("flat_key");
                keyElement.style.backgroundColor = "white";
                keyElement.style.zIndex = "1";
                let blackNoteLeft = false;
                let blackNoteRight = false;
                if(midiNote >= 0)
                {
                    blackNoteLeft = isBlackNoteNumber(midiNote - 1);
                }
                if(midiNote < 127) {
                    blackNoteRight = isBlackNoteNumber(midiNote + 1);
                }

                if(blackNoteRight && blackNoteLeft)
                {
                    keyElement.classList.add("between_sharps");
                }
                else if(blackNoteLeft)
                {
                    keyElement.classList.add("left_sharp");
                }
                else if(blackNoteRight)
                {
                    keyElement.classList.add("right_sharp");
                }


            }
            this.keyColors.push([keyElement.style.backgroundColor]);
            this.keyboard.appendChild(keyElement);
            this.keys.push(keyElement);
        }

        // channel selector
        this.selectorMenu = document.getElementById("keyboard_selector");
        const channelSelector = document.createElement("select");

        let channelNumber = 0;
        for(const channel of this.synth.midiChannels)
        {
            const option = document.createElement("option");

            option.value = channelNumber.toString();
            option.innerText = `Channel ${channelNumber + 1}`;

            option.style.backgroundColor = channelColors[channelNumber];
            option.style.color = "rgb(0, 0, 0)";

            channelSelector.appendChild(option);
            channelNumber++;
        }
        channelSelector.onchange = () => {
            this.selectChannel(parseInt(channelSelector.value));
        }
        this.selectorMenu.appendChild(channelSelector);

        this.handler = handler;
        handler.createMIDIDeviceHandler().then(() => {
            // input selector
            const inputSelector = document.createElement("select");
            // no device
            inputSelector.innerHTML = "<option value='-1' selected>No input selected</option>";
            for(const input of handler.inputs)
            {
                const option = document.createElement("option");
                option.value = input[0];
                option.innerText = input[1].name;
                inputSelector.appendChild(option);
            }
            inputSelector.onchange = () => {
                if(inputSelector.value === "-1")
                {
                    handler.disconnectAllDevicesFromSynth();
                }
                else
                {
                    handler.connectDeviceToSynth(handler.inputs.get(inputSelector.value), this.synth);
                }
            }

            this.selectorMenu.appendChild(inputSelector);
        });
    }

    createMIDIOutputSelector(seq)
    {
        // output selector
        const outputSelector = document.createElement("select");
        // no device
        outputSelector.innerHTML = "<option value='-1' selected>No output selected</option>";
        for(const output of this.handler.outputs)
        {
            const option = document.createElement("option");
            option.value = output[0];
            option.innerText = output[1].name;
            outputSelector.appendChild(option);
        }

        outputSelector.onchange = () => {
            if(outputSelector.value === "-1")
            {
                this.handler.disconnectSeqFromMIDI(seq);
            }
            else
            {
                this.handler.connectMIDIOutputToSeq(this.handler.outputs.get(outputSelector.value), seq);
            }
        }

        this.selectorMenu.appendChild(outputSelector);
    }

    /**
     * Selects the channel from synth
     * @param channel {number} 0-15
     */
    selectChannel(channel)
    {
        this.channel = channel;
    }

    /**
     * presses a midi note visually
     * @param midiNote {number} 0-127
     * @param channel {number} 0-15     * @param volume {number} 0-1
     * @param expression {number} 0-1
     * @param volume {number} 0-1
     * @param velocity {number} 0-127
     */
    pressNote(midiNote, channel, velocity, volume, expression)
    {
        let key = this.keys[midiNote];
        key.classList.add("pressed");

        let isSharp = key.classList.contains("sharp_key");
        let brightness = expression * volume * (velocity / 127);
        let rgbaValues = this.channelColors[channel].match(/\d+(\.\d+)?/g).map(parseFloat);

        // multiply the rgb values by brightness
        if (!isSharp) {
            // multiply the rgb values
            let newRGBValues = rgbaValues.slice(0, 3).map(value => 255 - (255 - value) * brightness);

            // create the new color
            key.style.backgroundColor = `rgba(${newRGBValues.join(", ")}, ${rgbaValues[3]})`;
        }
        else
        {
            // multiply the rgb values
            let newRGBValues = rgbaValues.slice(0, 3).map(value => value * brightness);

            // create the new color
            key.style.backgroundColor = `rgba(${newRGBValues.join(", ")}, ${rgbaValues[3]})`;
        }
        /**
         * @type {string[]}
         */
        this.keyColors[midiNote].push(this.channelColors[channel]);
    }

    releaseNote(midiNote)
    {
        if(midiNote > 127 || midiNote < 0)
        {
            return;
        }
        let key = this.keys[midiNote];

        /**
         * @type {string[]}
         */
        let pressedColors = this.keyColors[midiNote];
        if(pressedColors.length > 1) {
            pressedColors.pop();
        }
        if(pressedColors.length === 1)
        {
            key.classList.remove("pressed");
        }
        key.style.backgroundColor = pressedColors[pressedColors.length - 1];
    }
}
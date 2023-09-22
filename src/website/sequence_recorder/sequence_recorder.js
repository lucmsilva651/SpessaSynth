import { SequenceEvent } from './sequence_event.js'
import { messageTypes } from '../../spessasynth_lib/midi_parser/midi_message.js'
import { ShiftableByteArray } from '../../spessasynth_lib/utils/shiftable_array.js'

export class SequenceRecorder
{
    /**
     * Creates a new sequence recorder
     * @param synth {Synthetizer}
     */
    constructor(synth) {
        this.absoluteStartTime = synth.currentTime;
        this.synth = synth;
        /**
         * @type {SequenceEvent[]}
         */
        this.events = [];
    }

    /**
     * Starts recording the synth's inputs
     * @param desiredChannel {number} the channel to record, 0-15
     */
    startRecording(desiredChannel)
    {
        this.targetChannel = desiredChannel;
        // connect to synth
        this.synth.onNoteOn.push(this.noteOn.bind(this));
        this.nOnI = this.synth.onNoteOn.length - 1; // note on index
        this.synth.onNoteOff.push(this.noteOff.bind(this));
        this.nOffI = this.synth.onNoteOn.length - 1; // note off index
        this.synth.onControllerChange.push(this.controllerChange.bind(this));
        this.cCI = this.synth.onNoteOn.length - 1; // controller change index
        this.synth.onProgramChange.push(this.programChange.bind(this));
        this.pCI = this.synth.onNoteOn.length - 1; // program change index
        this.synth.onPitchWheel.push(this.pitchWheel.bind(this));
        this.pWI = this.synth.onNoteOn.length - 1; // pitch wheel index
    }

    stopRecording()
    {
        this.synth.onNoteOff.splice(this.nOffI, 1);
        this.synth.onNoteOn.splice(this.nOnI, 1);
        this.synth.onControllerChange.splice(this.cCI, 1);
        this.synth.onProgramChange.splice(this.pCI, 1);
        this.synth.onPitchWheel.splice(this.pWI, 1);
        // this.synth.onNoteOff = this.synth.onNoteOff.filter(e => e !== this.noteOff.bind(this));
        // this.synth.onNoteOn = this.synth.onNoteOn.filter(e => e !== this.noteOn.bind(this));
        // this.synth.onControllerChange = this.synth.onControllerChange.filter(e => e !== this.controllerChange.bind(this));
        // this.synth.onProgramChange = this.synth.onProgramChange.filter(e => e !== this.programChange.bind(this));
        // this.synth.onPitchWheel = this.synth.onPitchWheel.filter(e => e !== this.pitchWheel.bind(this));
    }

    getTime()
    {
        return this.synth.currentTime - this.absoluteStartTime;
    }

    getStatusByte(event, channel)
    {
        return event | channel;
    }

    /**
     * @param midiNote {number}
     * @param channel {number}
     * @param velocity {number}
     */
    noteOn(midiNote, channel, velocity)
    {
        if(channel !== this.targetChannel)
        {
            return;
        }
        this.events.push(new SequenceEvent(this.getTime(), this.getStatusByte(messageTypes.noteOn, channel), new ShiftableByteArray([midiNote, velocity])));
    }

    /**
     * @param midiNote {number}
     * @param channel {number}
     */
    noteOff(midiNote, channel)
    {
        if(channel !== this.targetChannel)
        {
            return;
        }
        this.events.push(new SequenceEvent(this.getTime(), this.getStatusByte(messageTypes.noteOff, channel), new ShiftableByteArray([midiNote])));
    }

    /**
     * @param channel {number}
     * @param ccNum {number}
     * @param ccVal {number}
     */
    controllerChange(channel, ccNum, ccVal)
    {
        if(channel !== this.targetChannel)
        {
            return;
        }
        this.events.push(new SequenceEvent(this.getTime(), this.getStatusByte(messageTypes.controllerChange, channel), new ShiftableByteArray([ccNum, ccVal])));
    }

    /**
     * @param channel {number}
     * @param preset {Preset}
     */
    programChange(channel, preset)
    {
        if(channel !== this.targetChannel)
        {
            return;
        }
        this.events.push(new SequenceEvent(this.getTime(), this.getStatusByte(messageTypes.programChange, channel), new ShiftableByteArray([preset.program])));
    }

    /**
     * @param channel {number}
     * @param msb {number}
     * @param lsb {number}
     */
    pitchWheel(channel, msb, lsb)
    {
        if(channel !== this.targetChannel)
        {
            return;
        }
        this.events.push(new SequenceEvent(this.getTime(), this.getStatusByte(messageTypes.pitchBend, channel), new ShiftableByteArray([lsb, msb])));
    }
}
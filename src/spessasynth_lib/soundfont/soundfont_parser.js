import {ShiftableByteArray} from "../utils/shiftable_array.js";
import {readSamples} from "./chunk/samples.js";
import {readRIFFChunk, readBytesAsString} from "../utils/byte_functions.js";
import {readGenerators, Generator} from "./chunk/generators.js";
import {readInstrumentZones, InstrumentZone, readPresetZones} from "./chunk/zones.js";
import {Preset, readPresets} from "./chunk/presets.js";
import {readInstruments, Instrument} from "./chunk/instruments.js";
import {readModulators, Modulator} from "./chunk/modulators.js";
import {RiffChunk} from "./chunk/riff_chunk.js";

export class SoundFont2
{
    /**
     * Initializes a new SoundFont2 Parser and parses the given data array
     * @param dataArray {ShiftableByteArray}
     */
    constructor(dataArray) {
        this.dataArray = dataArray;
        console.group("Parsing SoundFont...");
        if(!this.dataArray)
        {
            throw new Error("No data!");
        }

        // read the main chunk
        let firstChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(firstChunk, "riff");

        this.verifyText(readBytesAsString(this.dataArray,4), "sfbk");

        // INFO
        let infoChunk = readRIFFChunk(this.dataArray);
        this.verifyHeader(infoChunk, "list");
        readBytesAsString(infoChunk.chunkData, 4);

        /**
         * @type {{chunk: string, infoText: string}[]}
         */
        this.soundFontInfo = [];

        while(infoChunk.chunkData.length > infoChunk.chunkData.currentIndex) {
            let chunk = readRIFFChunk(infoChunk.chunkData);
            let text = readBytesAsString(chunk.chunkData, chunk.chunkData.length);
            console.log(chunk.header, text);
            this.soundFontInfo.push({chunk: chunk.header, infoText: text});
        }

        // SDTA
        const sdtaChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(sdtaChunk, "list")
        this.verifyText(readBytesAsString(this.dataArray, 4), "sdta");

        // smpl
        console.log("Verifying smpl chunk...")
        let sampleDataChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(sampleDataChunk, "smpl");
        this.sampleDataStartIndex = dataArray.currentIndex;

        console.log("Skipping sample chunk, length:", sdtaChunk.size - 12);
        dataArray.currentIndex += sdtaChunk.size - 12;

        // PDTA
        console.log("Loading preset data chunk...")
        let presetChunk = readRIFFChunk(this.dataArray);
        this.verifyHeader(presetChunk, "list");
        readBytesAsString(presetChunk.chunkData, 4);

        // read the hydra chunks
        const presetHeadersChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetHeadersChunk, "phdr");

        const presetZonesChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetZonesChunk, "pbag");

        const presetModulatorsChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetModulatorsChunk, "pmod");

        const presetGeneratorsChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetGeneratorsChunk, "pgen");

        const presetInstrumentsChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetInstrumentsChunk, "inst");

        const presetInstrumentZonesChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetInstrumentZonesChunk, "ibag");

        const presetInstrumentModulatorsChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetInstrumentModulatorsChunk, "imod");

        const presetInstrumentGeneratorsChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetInstrumentGeneratorsChunk, "igen");

        const presetSamplesChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(presetSamplesChunk, "shdr");

        /**
         * read all the samples
         * (the current index points to start of the smpl chunk)
         */
        this.dataArray.currentIndex = this.sampleDataStartIndex
        let samples = readSamples(presetSamplesChunk, this.dataArray);

        /**
         * read all the instrument generators
         * @type {Generator[]}
         */
        let instrumentGenerators = readGenerators(presetInstrumentGeneratorsChunk);

        /**
         * read all the instrument modulators
         * @type {Modulator[]}
         */
        let instrumentModulators = readModulators(presetInstrumentModulatorsChunk);

        /**
         * read all the instrument zones
         * @type {InstrumentZone[]}
         */
        let instrumentZones = readInstrumentZones(presetInstrumentZonesChunk,
            instrumentGenerators,
            instrumentModulators,
            samples);

        /**
         * read all the instruments
         * @type {Instrument[]}
         */
        let instruments = readInstruments(presetInstrumentsChunk, instrumentZones);

        /**
         * read all the preset generators
         * @type {Generator[]}
         */
        let presetGenerators = readGenerators(presetGeneratorsChunk);

        /**
         * Read all the preset modulatorrs
         * @type {Modulator[]}
         */
        let presetModulators = readModulators(presetModulatorsChunk);

        let presetZones = readPresetZones(presetZonesChunk, presetGenerators, presetModulators, instruments);

        /**
         * Finally, read all the presets
         * @type {Preset[]}
         */
        this.presets = readPresets(presetHeadersChunk, presetZones);
        this.presets.sort((a, b) => (a.program - b.program) + (a.bank - b.bank));
        console.log("Parsing finished!");
        console.log("Presets:", this.presets.length);
        console.groupEnd();
    }

    /**
     * @param chunk {RiffChunk}
     * @param expected {string}
     */
    verifyHeader(chunk, expected)
    {
        if(chunk.header.toLowerCase() !== expected.toLowerCase())
        {
            throw `Invalid chunk header! Expected "${expected.toLowerCase()}" got "${chunk.header.toLowerCase()}"`;
        }
    }

    /**
     * @param text {string}
     * @param expected {string}
     */
    verifyText(text, expected)
    {
        if(text.toLowerCase() !== expected.toLowerCase())
        {
            throw `Invalid soundFont! Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"`;
        }
    }

    /**
     * Get the appropriate preset
     * @param bankNr {number}
     * @param presetNr {number}
     * @returns {Preset}
     */
    getPreset(bankNr, presetNr) {
        let preset = this.presets.find(p => p.bank === bankNr && p.program === presetNr);
        if (!preset)
        {
            preset = this.presets.find(p => p.program === presetNr && p.bank !== 128);
            if(bankNr === 128)
            {
                preset = this.presets.find(p => p.bank === 128 && p.program === presetNr);
                if(!preset)
                {
                    preset = this.presets.find(p => p.bank === 128);
                }
            }
        }
        if(!preset)
        {
            console.warn("Preset not found. Defaulting to:", this.presets[0].presetName);
            preset = this.presets[0];
        }
        return preset;
    }

    /**
     * gets preset by name
     * @param presetName {string}
     * @returns {Preset}
     */
    getPresetByName(presetName)
    {
        let preset = this.presets.find(p => p.presetName === presetName);
        if(!preset)
        {
            console.warn("Preset not found. Defaulting to:", this.presets[0].presetName);
            preset = this.presets[0];
        }
        return preset;
    }
}
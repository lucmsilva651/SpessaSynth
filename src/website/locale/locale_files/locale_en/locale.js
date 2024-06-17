import { settingsLocale } from './settings/settings.js'
import { musicPlayerModeLocale } from './music_player_mode.js'
import { synthesizerControllerLocale } from './synthesizer_controller/synthesizer_controller.js'
import { sequencerControllerLocale } from './sequencer_controller.js'

/**
 *
 * @type {CompleteLocaleTypedef}
 */
export const localeEnglish = {
    localeName: "English",
    // title messsage
    titleMessage: "SpessaSynth: SoundFont2 Javascript Synthetizer",
    demoTitleMessage: "SpessaSynth: SoundFont2 Javascript Synthetizer Online Demo",

    // top bar buttons
    midiUploadButton: "Upload your MIDI files",
    midiRenderButton: "Export MIDI audio",
    exportingAudio: "Exporting audio...",

    demoSoundfontUploadButton: "Upload the soundfont",
    demoGithubPage: "Project's page",
    demoBundledSoundfont: "Use the bundled SoundFont (22MB)",

    outOfMemory: "Your browser ran out of memory. Consider using Firefox or SF3 soundfont instead.\n\n (see console for error).",

    hideTopBar: {
        title: "Hide top bar",
        description: "Hide the top (title) bar to provide a more seamless experience",
    },

    // all translations split up
    musicPlayerMode: musicPlayerModeLocale,
    settings: settingsLocale,
    synthesizerController: synthesizerControllerLocale,
    sequencerController: sequencerControllerLocale
};
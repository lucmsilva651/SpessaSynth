import { rendererSettingsLocale } from './renderer_settings.js'
import { keyboardSettingsLocale } from './keyboard_settings.js'
import { midiSettingsLocale } from './midi_settings.js'

/**
 * @type {CompleteSettingsLocale}
 */
export const settingsLocale = {
    toggleButton: "設定",
    mainTitle: "プログラム設定",

    rendererSettings: rendererSettingsLocale,
    keyboardSettings: keyboardSettingsLocale,
    midiSettings: midiSettingsLocale,

    interfaceSettings: {
        title: "インターフェース設定",

        toggleTheme: {
            title: "テーマを切り替え",
            description: "プログラムのテーマを切り替えます"
        },

        selectLanguage: {
            title: "言語",
            description: "プログラムの言語を変更します"
        }
    }
};
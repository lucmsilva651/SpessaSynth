/**
 * @typedef {{
 *  object: Object,
 *  propertyName: string,
 *  localePath: string,
 *  formattingArguments: string|number[],
 *  isEdited: boolean
 * }} PropertyType
 */
import { SpessaSynthInfo } from '../../spessasynth_lib/utils/loggin.js'

export class LocaleManager
{
    /**
     * Creates a new locale manager, responsible for managing and binding text values, then changing them when the locale changes
     * @param initialLocale {CompleteLocaleTypedef}
     */
    constructor(initialLocale) {
        this.locale = initialLocale;

        /**
         * All bound object properties and their respective objects
         * @type {PropertyType[]}
         * @private
         */
        this._boundObjectProperties = [];
    }

    /**
     * Resolves and gets a the localized string for the current path
     * @param localePath {string} The locale path to the text, written as JS object path, starts with "locale."
     * @returns {string} The localized string
     */
    getLocaleString(localePath)
    {
        return this._resolveLocalePath(localePath);
    }

    /**
     * @param property {PropertyType}
     * @private
     */
    _applyPropertyInternal(property)
    {
        // if edited, skip
        if(property.isEdited)
        {
            return;
        }
        let textValue = this._resolveLocalePath(property.localePath);
        if(property.formattingArguments.length > 0)
        {
            textValue = this._formatLocale(textValue, property.formattingArguments);
        }
        property.object[property.propertyName] = textValue;
    }

    /**
     * Checks if the property has changed and flags it as edited
     * @param property {PropertyType}
     * @private
     */
    _validatePropertyIntegrity(property)
    {
        // get the text value
        let textValue = this._resolveLocalePath(property.localePath);
        if(property.formattingArguments.length > 0)
        {
            textValue = this._formatLocale(textValue, property.formattingArguments);
        }
        if(property.object[property.propertyName] !== textValue)
        {
            property.isEdited = true;
        }
    }

    /**
     * calls it when the locale has changed (no arguments)
     * @type {function()[]}
     */
    onLocaleChanged = [];

    /**
     * replaces strings like "{0}" with the given arguments
     * @param template {string} the preformatted string
     * @param values {string|number[]} the values to fill the string with
     * @return {string} the formatted string
     * @private
     */
    _formatLocale(template, values)
    {
        return template.replace(/{(\d+)}/g, (match, number) => {
            return typeof values[number] !== 'undefined' ? values[number] : match;
        });
    }

    /**
     * Binds a given object's property to a locale path and applies it
     * @param object {Object} the object that holds the bound property
     * @param propertyName {string} the object's property to bind
     * @param localePath {string} The locale path to the text, written as JS object path, starts with "locale."
     * @param formattingArguments {string|number[]} optional arguments if the locale uses formatting ("{0} {1}") etc.
     */
    bindObjectProperty(object, propertyName, localePath, formattingArguments = [])
    {
        /**
         * Compile the property
         * @type {PropertyType}
         */
        const property = {
            object: object,
            propertyName: propertyName,
            localePath: localePath,
            formattingArguments: formattingArguments,
            isEdited: false
        };
        // apply value to the property
        this._applyPropertyInternal(property);
        // add to bound properties list
        this._boundObjectProperties.push(property);
    }

    /**
     * Resolves the locale path to get the string value from the locale object
     * @param path {string} The locale path to the text, written as JS object path, starts with "locale."
     * @returns {string} The string value from the path
     * @private
     */
    _resolveLocalePath(path)
    {
        if (!path.startsWith("locale."))
        {
            throw new Error(`Invalid locale path: ${path} (it should start with "locale.")`);
        }

        const parts = path.split('.');

        /**
         * Traverse the locale object to get the value
         * @type {Object|string}
          */
        let current = this.locale;
        for (let i = 1; i < parts.length; i++) // Start from 1 to skip "locale"
        {
            if (current[parts[i]] !== undefined)
            {
                current = current[parts[i]];
            } else
            {
                throw new Error(`Invalid locale path: ${path}: part "${parts[i]}" does not exist`);
            }
        }

        // Check if the final resolved value is a string
        if (typeof current !== 'string')
        {
            throw new Error(`Invalid locale path: ${path}: value is not a string. Perhaps the path is incomplete`);
        }

        return current;
    }

    /**
     * Changes the global locale and all bound text
     * @param newLocale {CompleteLocaleTypedef}
     */
    changeGlobalLocale(newLocale)
    {
        SpessaSynthInfo("Changing locale to", newLocale.localeName)
        // check if the property has been changed to something else. If so, don't change it back.
        this._boundObjectProperties.forEach(property => {
            this._validatePropertyIntegrity(property);
        })
        this.locale = newLocale;
        // apply the new locale to bound elements
        this._boundObjectProperties.forEach(property => {
            this._applyPropertyInternal(property);
        });
        this.onLocaleChanged.forEach(l => l());
    }
}
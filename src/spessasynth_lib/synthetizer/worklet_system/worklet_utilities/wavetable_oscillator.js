/**
 * wavetable_oscillator.js
 * purpose: plays back raw audio data at an arbitrary playback rate
 */

/**
 *
 * @enum {number}
 */
export const interpolationTypes = {
    linear: 0,
    nearestNeighbor: 1
}


/**
 * Fills the output buffer with raw sample data using linear interpolation
 * @param voice {WorkletVoice} the voice we're working on
 * @param outputBuffer {Float32Array} the output buffer to write to
 */
export function getSampleLinear(voice, outputBuffer)
{
    let cur = voice.sample.cursor;
    const loop = (voice.sample.loopingMode === 1) || (voice.sample.loopingMode === 3 && !voice.isInRelease);
    const sampleData = voice.sample.sampleData;

    if(loop)
    {
        const loopLength = voice.sample.loopEnd - voice.sample.loopStart;
        for (let i = 0; i < outputBuffer.length; i++)
        {
            // check for loop
            while(cur >= voice.sample.loopEnd)
            {
                cur -= loopLength;
            }

            // grab the 2 nearest points
            const floor = ~~cur;
            let ceil = floor + 1;

            while(ceil >= voice.sample.loopEnd)
            {
                ceil -= loopLength;
            }

            const fraction = cur - floor;

            // grab the samples and interpolate
            const upper = sampleData[ceil];
            const lower = sampleData[floor];
            outputBuffer[i] = (lower + (upper - lower) * fraction);

            // commented code because it's probably gonna come handy... (it did like 6 times already :/)
            // if(isNaN(outputBuffer[i]))
            // {
            //     console.error(voice, upper, lower, floor, ceil, cur)
            //     throw "NAN ALERT";
            // }

            cur += voice.sample.playbackStep * voice.currentTuningCalculated;
        }
    }
    else
    {
        // check and correct end errors
        if(voice.sample.end >= sampleData.length)
        {
            voice.sample.end = sampleData.length - 1;
        }
        for (let i = 0; i < outputBuffer.length; i++)
        {

            // linear interpolation
            const floor = ~~cur;
            const ceil = floor + 1;

            // flag the voice as finished if needed
            if(ceil >= voice.sample.end)
            {
                voice.finished = true;
                return;
            }

            const fraction = cur - floor;

            // grab the samples and interpolate
            const upper = sampleData[ceil];
            const lower = sampleData[floor];
            outputBuffer[i] = (lower + (upper - lower) * fraction);

            cur += voice.sample.playbackStep * voice.currentTuningCalculated;
        }
    }
    voice.sample.cursor = cur;
}

/**
 * Fills the output buffer with raw sample data using no interpolation (nearest neighbor)
 * @param voice {WorkletVoice} the voice we're working on
 * @param outputBuffer {Float32Array} the output buffer to write to
 */
export function getSampleNearest(voice, outputBuffer)
{
    let cur = voice.sample.cursor;
    const loop = (voice.sample.loopingMode === 1) || (voice.sample.loopingMode === 3 && !voice.isInRelease);
    const loopLength = voice.sample.loopEnd - voice.sample.loopStart;
    const sampleData = voice.sample.sampleData;
    if(loop)
    {
        for (let i = 0; i < outputBuffer.length; i++)
        {
            // check for loop
            while(cur >= voice.sample.loopEnd)
            {
                cur -= loopLength;
            }

            // grab the nearest neighbor
            let ceil = ~~cur + 1;

            while(ceil >= voice.sample.loopEnd)
            {
                ceil -= loopLength;
            }

            outputBuffer[i] = sampleData[ceil];
            cur += voice.sample.playbackStep * voice.currentTuningCalculated;
        }
    }
    else
    {
        // check and correct end errors
        if(voice.sample.end >= sampleData.length)
        {
            voice.sample.end = sampleData.length - 1;
        }
        for (let i = 0; i < outputBuffer.length; i++)
        {

            // nearest neighbor
            const ceil = ~~cur + 1;

            // flag the voice as finished if needed
            if(ceil >= voice.sample.end)
            {
                voice.finished = true;
                return;
            }

            //nearest neighbor (uncomment to use)
            outputBuffer[i] = sampleData[ceil];
            cur += voice.sample.playbackStep * voice.currentTuningCalculated;
        }
    }
    voice.sample.cursor = cur;
}
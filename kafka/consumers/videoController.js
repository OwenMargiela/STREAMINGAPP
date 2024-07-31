const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const https = require('https');
const { PassThrough } = require('stream');

/**
 * Downloads the video from the URL into a buffer.
 * @param {string} url - The URL of the video to download.
 * @returns {Promise<Buffer>} - A promise that resolves with the video buffer.
 */
async function downloadVideoToBuffer(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Transcodes a video buffer to HLS format.
 * @param {Buffer} videoBuffer - The video buffer to transcode.
 */
async function Transcoder(videoBuffer) {
    // Create the output directory if it does not exist
    const outputDir = 'stream-pipe-output_hls';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const directories = [
        'stream-pipe-output_hls/output_720',
        'stream-pipe-output_hls/output_480',
        'stream-pipe-output_hls/output_180'
    ];

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Encoding specifications
    const specs = [
        { resolution: '1280x720', bitrate: '2500k', audioBitrate: '192k', dir: 'output_720' },
        { resolution: '854x480', bitrate: '1000k', audioBitrate: '128k', dir: 'output_480' },
        { resolution: '320x180', bitrate: '500k', audioBitrate: '64k', dir: 'output_180' }
    ];

    for (const spec of specs) {
        const command = [
            '-i', 'pipe:0',
            '-c:v', 'libx264', '-b:v', spec.bitrate, '-s', spec.resolution, '-profile:v', 'baseline',
            '-c:a', 'aac', '-b:a', spec.audioBitrate, '-ac', '2',
            '-f', 'hls',
            '-hls_time', '4',
            '-hls_list_size', '10',
            '-hls_flags', 'independent_segments',
            '-hls_segment_type', 'mpegts',
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', `${outputDir}/${spec.dir}/segment_%03d.ts`,
            `${outputDir}/${spec.dir}/${spec.dir}.m3u8`
        ];

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', command, { stdio: ['pipe', 'inherit', 'inherit'] });

            ffmpeg.stdin.write(videoBuffer);
            ffmpeg.stdin.end();

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    console.error(`FFmpeg process exited with code ${code}`);
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                } else {
                    console.log(`HLS encoding for ${spec.dir} complete.`);
                    resolve();
                }
            });

            ffmpeg.on('error', (error) => {
                console.error(`Error during video encoding: ${error.message}`);
                reject(error);
            });
        });
    }

    // Create the master playlist
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    const masterPlaylistContent = specs.map(spec => {
        return `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(spec.bitrate) * 1000},RESOLUTION=${spec.resolution}\n${spec.dir}/${spec.dir}.m3u8`;
    }).join('\n');

    fs.writeFileSync(masterPlaylistPath, masterPlaylistContent);
    console.log('Master playlist created:', masterPlaylistPath);
}

/**
 * Full transcoder Pipeline: Downloads the video from the URL into a buffer. Transcodes a video buffer to HLS format 
 * and uploads to a storage blob
 * 
 *@param {string} url
 */
function TranscoderPipeline(url) {

    downloadVideoToBuffer(url)
        .then(videoBuffer => Transcoder(videoBuffer))
        .then(() => console.log('Transcoding complete'))
        .catch(err => console.error('Error during transcoding:', err));
}


function Thumbnail_gen() {

}



module.exports = {
    TranscoderPipeline
}
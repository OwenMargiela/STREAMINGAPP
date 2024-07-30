const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

/**
 * 
 * @param {string} inputFile 
 */

async function Transcoder(inputFile) {

    // Create the output directory if it does not exist
    const outputDir = 'output_hls';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    const directories = [
        'output_hls/output_720',
        'output_hls/output_480',
        'output_hls/output_180'
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
        const command = `ffmpeg -i ${inputFile} \
            -c:v:0 libx264 -b:v:0 ${spec.bitrate} -s:v:0 ${spec.resolution} -profile:v:0 baseline \
            -c:a:0 aac -b:a:0 ${spec.audioBitrate} -ac 2 \
            -f hls \
            -hls_time 4 \
            -hls_list_size 10 \
            -hls_flags independent_segments \
            -hls_segment_type mpegts \
            -hls_playlist_type vod \
            -hls_segment_filename ${outputDir}/${spec.dir}/segment_%03d.ts \
            ${outputDir}/${spec.dir}/${spec.dir}.m3u8`;

        await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error during video encoding: ${error.message}`);
                    console.error(`FFmpeg command: ${command}`);
                    reject(error);
                    return;
                }
                if (stderr) {
                    console.error(`FFmpeg stderr: ${stderr}`);
                }
                console.log(`HLS encoding for ${spec.dir} complete.`);
                console.log(`FFmpeg stdout: ${stdout}`);
                resolve();
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


function Thumbnail_gen() {

}



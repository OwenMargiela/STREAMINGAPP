const mongoose = require('mongoose');


const user_ref = new mongoose.Schema({
    user_ID: { type: mongoose.Schema.ObjectId, required: false },
    channel_URL: { type: String, required: true },
    channel_Avatar: { type: String, required: false },
    user_handle: { type: String, required: true },
});

const point_in_time_formater = new mongoose.Schema({
    hours: { type: Number, required: false },
    minutes: { type: Number, required: false },
    seconds: { type: Number, required: true },
    time_in_seconds: { type: Number, required: true }
});

const chapters = new mongoose.Schema({
    start: { type: point_in_time_formater, required: true },
    end: {
        type: point_in_time_formater,
        required: true,
        validate: {
            validator: function (value) {
                return this.start && this.start.time_in_seconds <= value.time_in_seconds;
            },
            message: 'End time should be greater than or equal to start time.'
        }
    },
    title: { type: String, required: true },
    description: { type: String }
});

const video_metadat_ref = new mongoose.Schema({
    number_of_likes: { type: Number, required: true, min: 0 },
    number_of_dislikes: { type: Number, required: true, min: 0 },
    comment_section_ID: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    author: { type: user_ref, required: true },
    length: { type: Number, required: true },
    video_ID: { type: mongoose.Schema.ObjectId, required: false },
    chapters: [{ type: chapters, required: false }],
    Url: { type: String, required: true }
});


const commentSection = new mongoose.Schema({})

const comment = new mongoose.Schema({
    commentID: { type: mongoose.Schema.ObjectId, required: true },
    commentSectionID: { type: mongoose.Schema.ObjectId, required: true },
    commentBody: { type: String, required: true },
    numberOfLikes: { type: Number, default: 0 },
    numberOfDislikes: { type: Number, default: 0 },
    channelAvatar: { type: String, required: true },
    channelUrl: { type: String, required: true },
    handle: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    videoId: { type: String, required: true }
});

const playlist = new mongoose.Schema({
    playlistId: { type: mongoose.Schema.ObjectId, required: true, unique: true },
    title: { type: String, required: true },
    creator: { type: user_ref, required: true }, // reference to User model
    videos: [{ type: video_metadat_ref }], // array of video references
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const user_data_schema = new mongoose.Schema({
    user_data: { type: user_ref, required: true },
    comments: [{ type: comment, required: false }],
    subscribers: [{ type: user_ref, required: false }],
    subscriptions: [{ type: user_ref, required: false }],
    videos: [{ type: video_metadat_ref, required: false }],
    liked_videos_ID: [{ type: mongoose.Schema.ObjectId, ref: 'VideoMetadataRef', required: false }],

    playlists: { type: playlist, required: false },
    history: { type: String, required: false },
    number_of_videos: { type: Number, required: true }
});

const User_ref = mongoose.model('UserRef', user_ref);
const Point_in_time_formater = mongoose.model('PointInTimeFormater', point_in_time_formater);
const Chapters = mongoose.model('Chapters', chapters);
const Video_metadat_ref = mongoose.model('VideoMetadataRef', video_metadat_ref);
const Comment = mongoose.model('Comment', comment);
const Playlist = mongoose.model('Playlist', playlist);
const User_data_schema = mongoose.model('UserData', user_data_schema);

module.exports = {
    UserRef: User_ref,
    PointInTimeFormater: Point_in_time_formater,
    Chapters: Chapters,
    VideoMetadataRef: Video_metadat_ref,
    Comment: Comment,
    Playlist: Playlist,
    UserDataSchema: User_data_schema,
};
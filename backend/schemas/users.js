import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        default: 'user'
    },
    channels: {
        type: [String],
        default: ['RoMan_World_Official']
    },
    'selected theme': {
        type: String,
        default: 'light'
    }
});

export default mongoose.model('User', userSchema);
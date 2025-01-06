import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
    },
    id: {
        type: Number,
        required: true
    },
    author: {
        type: String,
        required: true
    },
    context: {
        type: String,
        required: true
    },
    date: {
        type: String,
    },
    replyTo: {
        type: Number,
        default: null
    }
}, { 
    _id: true 
});

const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    owner: {
        type: String,
        required: true
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    messages: {
        type: [messageSchema],
        default: []
    },
    subs: {
        type: [String],
        default: []
    },
    pinnedMessage: {
        type: Number,
        default: null
    }
}, {
    autoIndex: false 
});

messageSchema.pre('save', function(next) {
    if (this.date && typeof this.date === 'object') {
        const d = new Date(this.date);
        this.date = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    next();
});

export default mongoose.model('Channel', channelSchema);

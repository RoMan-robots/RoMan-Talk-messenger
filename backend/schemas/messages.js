import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId()
    },
    id: {
        type: String,
        default: function() {
            return this._id.toString();
        },
        unique: true
    },
    author: String,
    context: String,
    date: String,
    replyTo: String,
    photo: String
});

const ChannelSchema = new mongoose.Schema({
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
        type: [MessageSchema],
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

ChannelSchema.methods.createMessage = function(messageObject) {
    const newMessage = new Message({
        author: messageObject.author,
        context: messageObject.context,
        date: messageObject.date || new Date(),
        replyTo: messageObject.replyTo || null,
        channelName: this.name
    });

    return newMessage;
};

const Message = mongoose.model('Message', MessageSchema);
const Channel = mongoose.model('Channel', ChannelSchema);

export { Message, Channel };
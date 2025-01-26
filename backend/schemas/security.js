import mongoose from 'mongoose';

const securityLogSchema = new mongoose.Schema({
    message: String,
    device: String,
    location: String,
    when: String
}, { _id: false });

const securitySchema = new mongoose.Schema({
    security: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { 
    strict: false 
});

securitySchema.methods.addLog = function(username, logData) {
    if (!this.security[username]) {
        this.security[username] = [];
    }
    
    this.security[username].push(logData);
};

securitySchema.methods.getUserLogs = function(username) {
    return this.security[username] || [];
};

export default mongoose.model('Security', securitySchema);
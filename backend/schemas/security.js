import mongoose from 'mongoose';

const securityLogSchema = new mongoose.Schema({
    message: String,
    device: String,
    location: String,
    when: String
});

const userSecuritySchema = new mongoose.Schema({
    username: String,
    logs: [securityLogSchema]
});

const securitySchema = new mongoose.Schema({
    data: [userSecuritySchema]
});

securitySchema.methods.addLog = function(username, logData) {
    const userSecurity = this.data.find(item => Object.keys(item)[0] === username);
    if (!userSecurity) {
        this.data.push({ [username]: [logData] });
    } else {
        userSecurity[username].push(logData);
    }
};

securitySchema.methods.getUserLogs = function(username) {
    const userSecurity = this.data.find(item => Object.keys(item)[0] === username);
    return userSecurity ? userSecurity[username] : [];
};

export default mongoose.model('Security', securitySchema); 
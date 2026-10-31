import mongoose, {Schema} from "mongoose";

const userSchema = new Schema({
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    passwordHash: {type: String, required: true},
}, {timestamps: true});

const resumeSchema = new Schema({
    userId: {type: Schema.Types.ObjectId, ref: "User", required: true},
    companyName: {type: String, default: ""},
    jobTitle: {type: String, default: ""},
    jobDescription: {type: String, default: ""},
    resumeFile: {type: String, required: true},
    imageFile: {type: String, required: true},
    contentHash: {type: String, required: true},
    status: {type: String, enum: ["queued", "processing", "completed", "failed"], default: "queued"},
    feedback: {type: Schema.Types.Mixed, default: null},
    error: {type: String, default: null},
}, {timestamps: true});

// Newest-first listing for one user.
resumeSchema.index({userId: 1, createdAt: -1});
// Finds an earlier result for the same resume and job.
resumeSchema.index({userId: 1, contentHash: 1, status: 1});

export const User = mongoose.model("User", userSchema);
export const Resume = mongoose.model("Resume", resumeSchema);

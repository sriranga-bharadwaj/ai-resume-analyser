import mongoose from "mongoose";
import {createApp} from "./app";
import {config} from "./config";
import {createEnqueue} from "./queue";

config.jwtSecret();
await mongoose.connect(config.mongoUrl);

createApp(createEnqueue()).listen(config.port, () => {
    console.log(`API listening on port ${config.port}`);
});

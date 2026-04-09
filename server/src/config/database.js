// mongodb connection setup using mongoose

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const connectPromise = mongoose.connect(process.env.MONGODB_URI, {
            retryWrites: true,
            w: 'majority',
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 5000
        });

        // Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MongoDB connection timeout')), 8000)
        );

        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log('✅ MongoDB connected successfully');
        
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️ MongoDB disconnected');
        });

        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ Failed to connect MongoDB:', error.message);
        process.exit(1);
    }
}

module.exports = connectDB;
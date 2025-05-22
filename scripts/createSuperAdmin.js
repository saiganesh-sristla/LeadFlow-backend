import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/leadflow';

async function createSuperAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    
    const existingAdmin = await User.findOne({ email: 'admin@leadflow.com' });
    
    if (existingAdmin) {
      console.log('Super admin already exists');
      process.exit(0);
    }
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const superAdmin = new User({
      name: 'Super Admin',
      email: 'admin@leadflow.com',
      password: hashedPassword,
      role: 'super_admin',
      isActive: true,
    });
    
    await superAdmin.save();
    
    console.log('Super admin account created successfully');
  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
    await mongoose.disconnect();
  }
}

createSuperAdmin();
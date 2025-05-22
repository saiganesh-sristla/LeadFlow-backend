import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'agent'],
    default: 'agent',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  // createdAt: {
  //   type: Date,
  //   default: Date.now,
  // },
  // updatedAt: {
  //   type: Date,
  //   default: Date.now,
  // },
});

// Update the updatedAt field on save
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('User', UserSchema);
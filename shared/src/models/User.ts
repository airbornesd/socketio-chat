import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username?: string;
  password?: string;
  role: 'admin' | 'staff' | 'member';
  address?: string;
  from?: 'postman' | 'mobile';
  fcmToken?: string;
}

const schema = new Schema<IUser>(
  {
    username: { type: String, unique: true, sparse: true },
    password: { type: String },
    role: {
      type: String,
      enum: ['admin', 'staff', 'member'],
      default: 'member',
    },
    address: { type: String, unique: true },
    from: {
      type: String,
      enum: ['postman', 'mobile'],
      default: 'postman',
    },
    fcmToken: { type: String },
  },
  {
    timestamps: true,
  }
);

export const User: Model<IUser> = mongoose.model<IUser>('User', schema);

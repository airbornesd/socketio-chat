import mongoose, { Schema, Document, Model, Types, Date } from 'mongoose';

export interface IChat extends Document {
  members: Types.ObjectId[];
  type: 'chat' | 'group';
  creator: Types.ObjectId;
  name: string;
}

const schema = new mongoose.Schema(
  {
    members: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ],
    type: { type: String, enum: ['chat', 'group'], default: 'chat' },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String },
  },
  {
    timestamps: true,
  }
);

export const Chat: Model<IChat> = mongoose.model<IChat>('Chat', schema);

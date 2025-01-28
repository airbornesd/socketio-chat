import mongoose, { Schema, Document, Model, Types, Date } from 'mongoose';

export interface IMessage extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chatId: Types.ObjectId;
  content: string;
  sentAt: Date;
  deliveredAt: Date;
}

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    content: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const Message: Model<IMessage> = mongoose.model<IMessage>(
  'Message',
  schema
);

import { create } from 'zustand';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatStore {
  messages: ChatMessageData[];
  isLoading: boolean;
  addMessage: (role: 'user' | 'assistant', content: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,

  addMessage: (role: 'user' | 'assistant', content: string) => {
    const message: ChatMessageData = {
      id: generateId(),
      role,
      content,
      timestamp: new Date(),
    };
    set((state) => ({ messages: [...state.messages, message] }));
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  clearMessages: () => {
    set({ messages: [] });
  },
}));

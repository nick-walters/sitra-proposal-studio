
-- Create direct messages table
CREATE TABLE public.direct_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast conversation lookups
CREATE INDEX idx_direct_messages_conversation ON public.direct_messages (
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at
);

-- Enable RLS
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can see messages they sent or received
CREATE POLICY "Users can view their own messages"
ON public.direct_messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send messages (as themselves)
CREATE POLICY "Users can send messages"
ON public.direct_messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

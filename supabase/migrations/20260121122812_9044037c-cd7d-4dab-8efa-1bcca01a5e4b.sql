-- Add new address fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS address_line_2 text,
ADD COLUMN IF NOT EXISTS postcode text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS country_code text;

-- Create storage bucket for profile avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow users to view all avatars (public bucket)
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'profile-avatars');

-- Allow authenticated users to upload their own avatar
CREATE POLICY "Users can upload their own avatar" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own avatar
CREATE POLICY "Users can update their own avatar" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own avatar
CREATE POLICY "Users can delete their own avatar" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'profile-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
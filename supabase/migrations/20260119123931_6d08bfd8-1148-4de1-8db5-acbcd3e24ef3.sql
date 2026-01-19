-- Create storage bucket for proposal logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('proposal-logos', 'proposal-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own proposal logos
CREATE POLICY "Users can upload proposal logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'proposal-logos' 
  AND auth.role() = 'authenticated'
);

-- Allow public read access to logos
CREATE POLICY "Logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'proposal-logos');

-- Allow users to update/delete their uploads
CREATE POLICY "Users can update own logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'proposal-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'proposal-logos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
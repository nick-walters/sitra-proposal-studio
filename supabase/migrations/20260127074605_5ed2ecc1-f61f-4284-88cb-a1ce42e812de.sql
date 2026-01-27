-- Create storage bucket for participant logos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('participant-logos', 'participant-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to logos
CREATE POLICY "Public read access for logos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'participant-logos');

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'participant-logos');

-- Allow authenticated users to update logos
CREATE POLICY "Authenticated users can update logos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'participant-logos');

-- Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete logos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'participant-logos');
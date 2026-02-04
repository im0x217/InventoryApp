/*
  # Create Inventory Management Table

  1. New Tables
    - `inventory`
      - `id` (int8, primary key) - Unique identifier for each product
      - `name` (text, not null) - Product name
      - `quantity` (int4, default 0) - Current stock quantity
      - `min_stock` (int4, default 5) - Minimum stock level threshold
      - `category` (text) - Product category for organization
      - `created_at` (timestamptz) - Timestamp when product was added
      - `updated_at` (timestamptz) - Timestamp when product was last modified

  2. Security
    - Enable RLS on `inventory` table
    - Add policy for authenticated users to read all inventory items
    - Add policy for authenticated users to insert new products
    - Add policy for authenticated users to update inventory
    - Add policy for authenticated users to delete products

  3. Notes
    - Default quantity is set to 0 for new products
    - Default min_stock is set to 5 as a reasonable threshold
    - Timestamps automatically track when records are created and updated
    - RLS policies allow authenticated users full CRUD access to inventory
*/

CREATE TABLE IF NOT EXISTS inventory (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  quantity integer DEFAULT 0,
  min_stock integer DEFAULT 5,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all inventory items
CREATE POLICY "Authenticated users can view inventory"
  ON inventory
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert new products
CREATE POLICY "Authenticated users can insert inventory"
  ON inventory
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update inventory
CREATE POLICY "Authenticated users can update inventory"
  ON inventory
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete products
CREATE POLICY "Authenticated users can delete inventory"
  ON inventory
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_inventory_updated_at ON inventory;
CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- A kert mérete az alaprajzhoz (cm); üres, amíg a felhasználó meg nem adja.
-- A korábbi, tetszőleges szögű elforgatás az alaprajzon csak 0° vagy 90° lehet.
ALTER TABLE garden ADD COLUMN length_cm INTEGER CHECK (length_cm > 0);
ALTER TABLE garden ADD COLUMN width_cm INTEGER CHECK (width_cm > 0);
UPDATE bed SET rotation_deg = CASE WHEN rotation_deg % 180 BETWEEN 45 AND 134 THEN 90 ELSE 0 END
WHERE rotation_deg NOT IN (0, 90);

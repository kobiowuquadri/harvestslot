-- Reference data every environment needs: the supported local government areas of Oyo State and
-- their approximate centres (used to place a farm when no GPS pin is given). Not demo data.
INSERT INTO "supported_locations" ("id", "state", "lga", "active", "centerLat", "centerLng") VALUES
  (gen_random_uuid(), 'Oyo', 'Afijio', true, 7.73, 3.92),
  (gen_random_uuid(), 'Oyo', 'Akinyele', true, 7.53, 3.92),
  (gen_random_uuid(), 'Oyo', 'Atiba', true, 7.85, 3.93),
  (gen_random_uuid(), 'Oyo', 'Egbeda', true, 7.38, 3.98),
  (gen_random_uuid(), 'Oyo', 'Ibadan North', true, 7.4, 3.91),
  (gen_random_uuid(), 'Oyo', 'Ibadan North-East', true, 7.39, 3.93),
  (gen_random_uuid(), 'Oyo', 'Ibadan North-West', true, 7.39, 3.88),
  (gen_random_uuid(), 'Oyo', 'Ibadan South-East', true, 7.36, 3.91),
  (gen_random_uuid(), 'Oyo', 'Ibadan South-West', true, 7.36, 3.87),
  (gen_random_uuid(), 'Oyo', 'Ibarapa Central', true, 7.43, 3.29),
  (gen_random_uuid(), 'Oyo', 'Ido', true, 7.5, 3.73),
  (gen_random_uuid(), 'Oyo', 'Iseyin', true, 7.97, 3.6),
  (gen_random_uuid(), 'Oyo', 'Itesiwaju', true, 8.15, 3.55),
  (gen_random_uuid(), 'Oyo', 'Kajola', true, 8.03, 3.35),
  (gen_random_uuid(), 'Oyo', 'Lagelu', true, 7.45, 4.02),
  (gen_random_uuid(), 'Oyo', 'Ogbomosho North', true, 8.13, 4.24),
  (gen_random_uuid(), 'Oyo', 'Ogbomosho South', true, 8.11, 4.25),
  (gen_random_uuid(), 'Oyo', 'Oluyole', true, 7.24, 3.84),
  (gen_random_uuid(), 'Oyo', 'Ona Ara', true, 7.32, 4.05),
  (gen_random_uuid(), 'Oyo', 'Oyo East', true, 7.85, 3.95),
  (gen_random_uuid(), 'Oyo', 'Oyo West', true, 7.84, 3.92),
  (gen_random_uuid(), 'Oyo', 'Saki East', true, 8.6, 3.68),
  (gen_random_uuid(), 'Oyo', 'Saki West', true, 8.67, 3.39),
  (gen_random_uuid(), 'Oyo', 'Surulere', true, 8.08, 4.4)
ON CONFLICT ("state", "lga") DO NOTHING;

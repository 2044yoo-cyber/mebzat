-- Fifty demo properties and ten demo agents, on the existing map.
--
-- Generated from supabase/seed/property-demo/*.csv by
-- scripts/build-property-demo-seed.py. Do not edit by hand: regenerate it, so
-- the file and the dataset cannot drift apart.
--
--   50 properties across 10 agents.
--   50 placed from their neighbourhood name; 0 left off the map.
--
-- Every row is sample data and says so: `is_sample = true`, no verified badge
-- (a trigger in 0043 refuses that combination), and a coordinate labelled
-- `approximate` because it is a neighbourhood centroid, not a building.
--
-- These go into the existing `properties` table, so the existing map, its
-- clustering, its filters and its property cards pick them up with no second
-- source of data and no second map.
--
-- Idempotent. Ids are derived from the dataset's own keys, so re-running
-- inserts nothing new. Removable: every row is registered in `seed_content`
-- under the batch 'property-demo-2026-08', and the footer of this file has the delete.
--
-- Additive. Run after 0043.

begin;

do $$
begin
  if to_regclass('public.properties') is null
     or not exists (
       select 1 from information_schema.columns
       where table_name = 'properties' and column_name = 'is_sample'
     ) then
    raise exception using
      message = 'Property demo seed: the location-accuracy columns are missing.',
      hint = 'Run migration 0043 first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The agents
--
-- Inserted into auth.users, which fires the trigger from 0001 and creates the
-- profile. Writing to public.profiles directly would leave accounts that cannot
-- be signed into and that no foreign key from auth would protect.
--
-- No password and no confirmed email: these are display-only accounts. Nobody
-- can sign in as one, which is the intended level of access for a fictional
-- person.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values

  ('b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, 'abel.demo@example.com'),
  ('4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'marta.demo@example.com'),
  ('a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'samuel.demo@example.com'),
  ('8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'hana.demo@example.com'),
  ('a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'dawit.demo@example.com'),
  ('9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, 'selam.demo@example.com'),
  ('a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, 'yonas.demo@example.com'),
  ('4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, 'mimi.demo@example.com'),
  ('27ecc715-c93e-6264-2da0-5828c0384996'::uuid, 'robel.demo@example.com'),
  ('22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, 'betelhem.demo@example.com')
on conflict (id) do nothing;

update public.profiles p
set full_name = a.full_name,
    company_name = a.company_name,
    location_city = 'Addis Ababa',
    bio = a.company_name || ' — demo agent based in ' || a.base_area ||
          '. Sample account created to populate the Medosha property '
          'marketplace. Not a real agent, and not a real agency.',
    account_type = 'individual',
    username = a.username,
    is_demo = true
from (values

  ('b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, 'Abel Kebede', 'Abel Homes Ethiopia', 'Bole', 'abel-kebede-d01'),
  ('4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'Marta Tesfaye', 'Addis Prime Realty', 'Kazanchis', 'marta-tesfaye-d02'),
  ('a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'Samuel Bekele', 'Nile Property Group', 'CMC', 'samuel-bekele-d03'),
  ('8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'Hana Girma', 'Bole Atlas Properties', 'Bole', 'hana-girma-d04'),
  ('a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'Dawit Alemu', 'Capital Homes Ethiopia', 'Sarbet', 'dawit-alemu-d05'),
  ('9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, 'Selam Worku', 'Addis Urban Estate', 'Megenagna', 'selam-worku-d06'),
  ('a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, 'Yonas Tadesse', 'Summit Realty Demo', 'Summit', 'yonas-tadesse-d07'),
  ('4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, 'Mimi Haile', 'Horizon Land & Homes', 'Ayat', 'mimi-haile-d08'),
  ('27ecc715-c93e-6264-2da0-5828c0384996'::uuid, 'Robel Mengistu', 'Ethio Living Demo', 'Lebu', 'robel-mengistu-d09'),
  ('22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, 'Betelhem Fikre', 'Nexus Demo Properties', 'Wollo Sefer', 'betelhem-fikre-d10')
) as a(id, full_name, company_name, base_area, username)
where p.id = a.id;

-- ---------------------------------------------------------------------------
-- The properties
-- ---------------------------------------------------------------------------

with demo (
  id, owner_id, title, slug, description, property_type, price,
  bedrooms, bathrooms, parking_spaces, area_m2, plot_area_m2,
  neighbourhood, location_city, latitude, longitude,
  location_accuracy, location_source, cover_image_url, source_url
) as (
  values

  ('4eb3679e-6eb1-6e9c-ccc4-e04f05aadf78'::uuid, 'b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, '3 Bedroom Condo', '3-bedroom-condo-demo-001', 'DEMO LISTING for Medosha testing. 3 Bedroom Condo in Summit Condo, Bole, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 8300000.0, 3, 1, 2, null, null, 'Summit', 'Addis Ababa', 9.009847, 38.847751, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('1e0343e1-b0d4-78bd-9bd2-3f8f7f2cfe10'::uuid, '4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'Luxury 2 Bedroom Apartment', 'luxury-2-bedroom-apartment-demo-002', 'DEMO LISTING for Medosha testing. Luxury 2 Bedroom Apartment in Bole Japan, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 21999999.0, 2, 2, 1, 119.0, null, 'Bole Japan', 'Addis Ababa', 8.993824, 38.793648, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('9d206d7e-ef85-4b1c-3955-ccf81426ee71'::uuid, 'a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'Luxurious Spacious 3 Bed Apartment', 'luxurious-spacious-3-bed-apartment-demo-003', 'DEMO LISTING for Medosha testing. Luxurious Spacious 3 Bed Apartment in Bole Atlas, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 48000000.0, 3, 3, 1, 240.0, null, 'Bole Atlas', 'Addis Ababa', 9.008833, 38.775682, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('86d5bcde-67f7-36d5-9b9f-d068f6891454'::uuid, '8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'Luxury 2 Bedroom Apartment', 'luxury-2-bedroom-apartment-demo-004', 'DEMO LISTING for Medosha testing. Luxury 2 Bedroom Apartment in Gerji, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 17999999.0, 2, 2, 1, 113.0, null, 'Gerji', 'Addis Ababa', 9.013801, 38.807581, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('92fab8d6-67f8-9d94-8ca9-3f0a32f7403a'::uuid, 'a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'Luxury 3 Bedroom Apartment', 'luxury-3-bedroom-apartment-demo-005', 'DEMO LISTING for Medosha testing. Luxury 3 Bedroom Apartment in Bole Denbel / Meskel Flower, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 26299000.0, 3, 3, 1, 155.0, null, 'Meskel Flower', 'Addis Ababa', 8.993813, 38.761615, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('b8201187-f0de-257c-93dc-48d82be41eab'::uuid, '9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, '2 Bedroom Condominium', '2-bedroom-condominium-demo-006', 'DEMO LISTING for Medosha testing. 2 Bedroom Condominium in Gerji, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 8000000.0, 2, 1, 1, null, null, 'Gerji', 'Addis Ababa', 9.013774, 38.807516, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('f1415250-cb10-a944-1768-419ab68cd0f1'::uuid, 'a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, 'Duplex Penthouse Type Apartment', 'duplex-penthouse-type-apartment-demo-007', 'DEMO LISTING for Medosha testing. Duplex Penthouse Type Apartment in Bole Wollo Sefer, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 149000000.0, 4, 3, 2, 630.0, null, 'Bole Wollo Sefer', 'Addis Ababa', 8.997588, 38.768548, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('ae28848f-64d1-d3b2-7d08-23e3391aa871'::uuid, '4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, 'Luxury 2 Bedroom Furnished Apartment', 'luxury-2-bedroom-furnished-apartment-demo-008', 'DEMO LISTING for Medosha testing. Luxury 2 Bedroom Furnished Apartment in Kazanchis, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 23181818.0, 2, 3, 1, 125.0, null, 'Kazanchis', 'Addis Ababa', 9.014853, 38.765989, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('af11e039-e8e0-df26-9fe1-4783967f0e85'::uuid, '27ecc715-c93e-6264-2da0-5828c0384996'::uuid, 'Luxury 3 Bedroom Apartment', 'luxury-3-bedroom-apartment-demo-009', 'DEMO LISTING for Medosha testing. Luxury 3 Bedroom Apartment in Sarbet, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 24999999.0, 3, 2, 1, 163.0, null, 'Sarbet', 'Addis Ababa', 8.993849, 38.748022, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('68cced57-346a-8189-973a-3d19ff3e202b'::uuid, '22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, 'Mini Flat Development', 'mini-flat-development-demo-010', 'DEMO LISTING for Medosha testing. Mini Flat Development in Alem Bank, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 4300000.0, 1, 1, 0, null, null, 'Alem Bank', 'Addis Ababa', 8.988107, 38.690865, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('f01308c2-d853-e05c-14b7-98c0078b821f'::uuid, 'b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-011', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in Bole Edna Mall, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 29000000.0, 3, 3, 1, 193.0, null, 'Bole Edna Mall', 'Addis Ababa', 9.006141, 38.787865, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('13f9ad59-7d28-0741-e6cd-26f3a09c65db'::uuid, '4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, '2 Bedroom Apartment', '2-bedroom-apartment-demo-012', 'DEMO LISTING for Medosha testing. 2 Bedroom Apartment in Kasanchis near ECA, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 25000000.0, 2, 2, 1, 103.0, null, 'Kazanchis', 'Addis Ababa', 9.01404, 38.766863, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('0e2abf06-075a-0774-d074-06233602efe4'::uuid, 'a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, '5 Bedroom G+3 House', '5-bedroom-g-3-house-demo-013', 'DEMO LISTING for Medosha testing. 5 Bedroom G+3 House in Lebu Haile Garment, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'house'::public.property_type, 21000000.0, 5, 5, 2, 300.0, null, 'Lebu Haile Garment', 'Addis Ababa', 8.963073, 38.718865, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('1b75b569-0bdd-8ab5-1fea-e4a812684e99'::uuid, '8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'G+2 + Basement House', 'g-2-basement-house-demo-014', 'DEMO LISTING for Medosha testing. G+2 + Basement House in Summit by Cambridge, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'house'::public.property_type, 35000000.0, 6, 4, 3, 400.0, null, 'Summit by Cambridge', 'Addis Ababa', 9.011975, 38.852855, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('9855159e-45b8-6f3d-fa32-b635f512b22a'::uuid, 'a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'Villa House', 'villa-house-demo-015', 'DEMO LISTING for Medosha testing. Villa House in Sarbet, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'villa'::public.property_type, 70000000.0, 4, 2, 3, 376.0, null, 'Sarbet', 'Addis Ababa', 8.993007, 38.74886, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('264ca8e3-622c-a44d-c9d0-b3c92ea27a53'::uuid, '9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, 'Villa', 'villa-demo-016', 'DEMO LISTING for Medosha testing. Villa in 22 Area, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'villa'::public.property_type, 60000000.0, 3, 1, 3, 400.0, null, '22 Area', 'Addis Ababa', 9.01791, 38.788842, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('e026d726-c6d3-1cb6-b30a-14439e6a3139'::uuid, 'a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, 'Villa', 'villa-demo-017', 'DEMO LISTING for Medosha testing. Villa in Wossen, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'villa'::public.property_type, 45000000.0, 5, 3, 3, 520.0, null, 'Wossen', 'Addis Ababa', 9.022942, 38.833849, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('b21caf12-3f79-2dac-24c2-8c9b52600b9a'::uuid, '4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, 'Villa', 'villa-demo-018', 'DEMO LISTING for Medosha testing. Villa in Kotebe, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'villa'::public.property_type, 38000000.0, 4, 3, 2, 375.0, null, 'Kotebe', 'Addis Ababa', 9.032375, 38.858821, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('3b3a7f78-d9b9-aefe-d55c-f98489d81eeb'::uuid, '27ecc715-c93e-6264-2da0-5828c0384996'::uuid, 'Office Building', 'office-building-demo-019', 'DEMO LISTING for Medosha testing. Office Building in Megenagna, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'commercial'::public.property_type, 90000000.0, null, null, 8, 284.0, null, 'Megenagna', 'Addis Ababa', 9.020408, 38.79981, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/commercial.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('5e2a4914-5e16-8647-c323-f827c1cac698'::uuid, '22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, 'Building for Sale', 'building-for-sale-demo-020', 'DEMO LISTING for Medosha testing. Building for Sale in Megenagna, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'commercial'::public.property_type, null, null, null, 5, 650.0, null, 'Megenagna', 'Addis Ababa', 9.019166, 38.798938, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/commercial.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('95504a08-73fc-f094-85f1-a73bc9f5f892'::uuid, 'b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, 'Prime Residential Land', 'prime-residential-land-demo-021', 'DEMO LISTING for Medosha testing. Prime Residential Land in Wossen, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, null, null, null, null, null, 560.0, 'Wossen', 'Addis Ababa', 9.022173, 38.832906, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('3ae0d45e-a1dd-b5a0-81ef-274eb97ac7dd'::uuid, '4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'Residential Land', 'residential-land-demo-022', 'DEMO LISTING for Medosha testing. Residential Land in Laga Tafo Abakiros, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, null, null, null, null, null, null, 'Laga Tafo', 'Addis Ababa', 9.052181, 38.919875, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('bc5b59ac-c181-44f5-175a-793ea307d3e4'::uuid, 'a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'Prime Land', 'prime-land-demo-023', 'DEMO LISTING for Medosha testing. Prime Land in Megenagna Kebena Bella, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, null, null, null, null, null, 451.0, 'Megenagna', 'Addis Ababa', 9.019191, 38.798844, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('8a49a0bf-0fd4-994b-e289-93f03b4190eb'::uuid, '8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'Residential Land', 'residential-land-demo-024', 'DEMO LISTING for Medosha testing. Residential Land in Lebu, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 45000000.0, null, null, null, null, 450.0, 'Lebu', 'Addis Ababa', 8.95415, 38.710071, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('56c96c8e-2f47-07ce-c447-e120bf96b81f'::uuid, 'a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'Residential Land', 'residential-land-demo-025', 'DEMO LISTING for Medosha testing. Residential Land in Ayat, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 14500000.0, null, null, null, null, 215.0, 'Ayat', 'Addis Ababa', 9.029152, 38.870037, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('af3a2cd5-90b3-08c9-4f8a-1065a8f38b37'::uuid, '9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, 'Residential Land', 'residential-land-demo-026', 'DEMO LISTING for Medosha testing. Residential Land in 22 Area, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 20000000.0, null, null, null, null, 228.0, '22 Area', 'Addis Ababa', 9.017155, 38.788004, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('5a732f73-2c89-4306-82fe-1a7f8f253604'::uuid, 'a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, 'Residential Land', 'residential-land-demo-027', 'DEMO LISTING for Medosha testing. Residential Land in Bole, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 22000000.0, null, null, null, null, 198.0, 'Bole', 'Addis Ababa', 9.00916, 38.779971, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('84040f5c-cedc-8f30-1202-13e9bc0f7fd6'::uuid, '4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, 'Mixed-use Land', 'mixed-use-land-demo-028', 'DEMO LISTING for Medosha testing. Mixed-use Land in Addisu Gebeya, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 30000000.0, null, null, null, null, 400.0, 'Addisu Gebeya', 'Addis Ababa', 9.044155, 38.742206, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('b5066de6-55ac-1a13-491b-c4c6a3d8093a'::uuid, '27ecc715-c93e-6264-2da0-5828c0384996'::uuid, 'Large Land Parcel', 'large-land-parcel-demo-029', 'DEMO LISTING for Medosha testing. Large Land Parcel in CMC, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 150000000.0, null, null, null, null, 1472.0, 'CMC', 'Addis Ababa', 9.028151, 38.821172, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('7c782f68-2ea8-1289-8e00-e566080e3748'::uuid, '22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, 'Residential Land', 'residential-land-demo-030', 'DEMO LISTING for Medosha testing. Residential Land in Bole Medhanialem, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 120000000.0, null, null, null, null, 500.0, 'Bole Medhanialem', 'Addis Ababa', 9.009604, 38.781089, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('c7c7dd86-7ae6-58df-ca58-1272b020739c'::uuid, 'b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, 'Residential Land', 'residential-land-demo-031', 'DEMO LISTING for Medosha testing. Residential Land in Bole Imperial, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 41000000.0, null, null, null, null, 307.0, 'Bole Imperial', 'Addis Ababa', 9.016879, 38.795431, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('2a33eb7c-7321-7766-186c-99cbb0ccc9dd'::uuid, '4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'Residential Land', 'residential-land-demo-032', 'DEMO LISTING for Medosha testing. Residential Land in Abinet, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 23000000.0, null, null, null, null, 320.0, 'Abinet', 'Addis Ababa', 9.004856, 38.727474, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('d2dab145-d2a7-81c4-161b-0a91ce938cea'::uuid, 'a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'Large Residential Land', 'large-residential-land-demo-033', 'DEMO LISTING for Medosha testing. Large Residential Land in Ferensay, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 85000000.0, null, null, null, null, 1600.0, 'Ferensay', 'Addis Ababa', 9.045834, 38.775518, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('b26bcc45-56db-fe61-f6bd-879aa155a86a'::uuid, '8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'Residential Land', 'residential-land-demo-034', 'DEMO LISTING for Medosha testing. Residential Land in Kolfe Keranyo, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 18000000.0, null, null, null, null, 449.0, 'Kolfe Keranyo', 'Addis Ababa', 9.023814, 38.689563, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('c15cabeb-27d4-a76b-9cef-fae57ac46c5f'::uuid, 'a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, 'Residential Land', 'residential-land-demo-035', 'DEMO LISTING for Medosha testing. Residential Land in Gofa, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'land'::public.property_type, 32000000.0, null, null, null, null, 392.0, 'Gofa', 'Addis Ababa', 8.982795, 38.741609, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/landscape.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('df5486a6-bab5-e0f7-ee3b-70d8348775f5'::uuid, '9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, 'New Development 1 Bedroom', 'new-development-1-bedroom-demo-036', 'DEMO LISTING for Medosha testing. New Development 1 Bedroom in Bole Medhanialem, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 18400000.0, 1, 1, 1, 92.0, null, 'Bole Medhanialem', 'Addis Ababa', 9.009479, 38.781356, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('95760d8f-ce63-5ee7-955c-aa109b48df0f'::uuid, 'a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-037', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in Lebu, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 15000000.0, 3, 2, 1, 108.0, null, 'Lebu', 'Addis Ababa', 8.953764, 38.709703, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('97ed3f7d-dc4d-4733-d8f8-696667e4663b'::uuid, '4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, '3 Bedroom Condominium', '3-bedroom-condominium-demo-038', 'DEMO LISTING for Medosha testing. 3 Bedroom Condominium in Ayat, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 5500000.0, 3, 1, 1, 107.0, null, 'Ayat', 'Addis Ababa', 9.028751, 38.869751, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('de0dafa0-5080-3cc2-8b5f-76afd0b8d31d'::uuid, '27ecc715-c93e-6264-2da0-5828c0384996'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-039', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in CMC, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 22500000.0, 3, 2, 1, 144.0, null, 'CMC', 'Addis Ababa', 9.027739, 38.8208, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('f6bd0702-a20b-d861-d4cb-252b201b4929'::uuid, '22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, '4 Bedroom Apartment', '4-bedroom-apartment-demo-040', 'DEMO LISTING for Medosha testing. 4 Bedroom Apartment in Bole Bulbula, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 82000000.0, 4, 3, 2, null, null, 'Bole Bulbula', 'Addis Ababa', 8.956137, 38.787287, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('219282e2-a8e6-7e8c-896f-ef5afc67adf3'::uuid, 'b41597ab-6ae2-6eee-680d-1a30aab78120'::uuid, '2 Bedroom Apartment', '2-bedroom-apartment-demo-041', 'DEMO LISTING for Medosha testing. 2 Bedroom Apartment in Summit, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 20000000.0, 2, 2, 1, null, null, 'Summit', 'Addis Ababa', 9.009088, 38.849289, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('6ea13e79-a4c8-d624-01e5-83812f7e18dc'::uuid, '4cf5ba67-ece3-1d54-cffd-a468b66563e8'::uuid, 'Villa', 'villa-demo-042', 'DEMO LISTING for Medosha testing. Villa in Ayat, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'villa'::public.property_type, 20000000.0, 4, 3, 2, 175.0, null, 'Ayat', 'Addis Ababa', 9.030236, 38.871279, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('c6820f16-633a-683b-eed9-6a8bc0077c46'::uuid, 'a4a4c531-72bb-51ed-f35f-35085a415862'::uuid, 'Furnished 3 Bedroom Apartment', 'furnished-3-bedroom-apartment-demo-043', 'DEMO LISTING for Medosha testing. Furnished 3 Bedroom Apartment in Shola, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 20000000.0, 3, 2, 1, null, null, 'Shola', 'Addis Ababa', 9.028186, 38.806284, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('018a41fb-f46b-2794-7cbe-ae1b3aa6917d'::uuid, '8a9137d2-ea61-904f-fb36-6c275c3c42c7'::uuid, 'Modern 3 Bedroom Apartment', 'modern-3-bedroom-apartment-demo-044', 'DEMO LISTING for Medosha testing. Modern 3 Bedroom Apartment in CMC, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 16000000.0, 3, 2, 1, null, null, 'CMC', 'Addis Ababa', 9.02894, 38.822282, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('871ed672-5fcc-499c-18eb-98a844aac2c1'::uuid, 'a022307e-c2ae-7dec-61a6-59aa69b7e9a5'::uuid, '3 Bedroom New Development', '3-bedroom-new-development-demo-045', 'DEMO LISTING for Medosha testing. 3 Bedroom New Development in Bole, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, null, 3, 3, 1, null, null, 'Bole', 'Addis Ababa', 9.009891, 38.781276, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('87d4acd3-4d7b-703d-ff68-03f8e4818834'::uuid, '9f2f121a-0d7b-f3cd-9c8f-d3afe80502f6'::uuid, '2 Bedroom New Development', '2-bedroom-new-development-demo-046', 'DEMO LISTING for Medosha testing. 2 Bedroom New Development in Bole, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, null, 2, 2, 1, null, null, 'Bole', 'Addis Ababa', 9.010038, 38.781289, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('94e402e3-13f4-19ff-6f25-fc44318c1b9b'::uuid, 'a6fc7ba7-2071-f1b2-03bb-03d58677f925'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-047', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in Gerji Imperial, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 7500000.0, 3, 1, 1, null, null, 'Gerji Imperial', 'Addis Ababa', 9.017989, 38.809287, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('441159ee-79ea-6bc6-b555-52948d4dbc81'::uuid, '4dc1105c-d877-72d9-12bc-e9affa44ac32'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-048', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in Bole Atlas, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 35000000.0, 3, 3, 1, 202.0, null, 'Bole Atlas', 'Addis Ababa', 9.008526, 38.777205, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('5ec17c61-91ba-74ed-0907-6e2b4016bc70'::uuid, '27ecc715-c93e-6264-2da0-5828c0384996'::uuid, '3 Bedroom Apartment', '3-bedroom-apartment-demo-049', 'DEMO LISTING for Medosha testing. 3 Bedroom Apartment in Bole Wollo Sefer, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 28000000.0, 3, 2, 1, 163.0, null, 'Bole Wollo Sefer', 'Addis Ababa', 8.997279, 38.770222, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa'),
  ('5a17a373-cd0f-cb43-8654-a554692b7bed'::uuid, '22f55088-b514-77d5-a99b-e9bdd7683c30'::uuid, '2 Bedroom Apartment', '2-bedroom-apartment-demo-050', 'DEMO LISTING for Medosha testing. 2 Bedroom Apartment in Bole Wollo Sefer, Addis Ababa. This record is sample data inspired by Ethiopian property-market categories and must not be presented as a verified live listing.', 'apartment'::public.property_type, 15000000.0, 2, 2, 1, 86.0, null, 'Bole Wollo Sefer', 'Addis Ababa', 8.995543, 38.768885, 'approximate'::public.location_accuracy, 'demo_neighborhood_geocode', '/images/projects/residential.svg', 'https://ethiopiapropertycentre.com/for-sale/addis-ababa')
)
insert into public.properties (
  id, owner_id, title, slug, description, property_type, listing_kind,
  price, currency, bedrooms, bathrooms, parking_spaces, area_m2, plot_area_m2,
  neighbourhood, location_city, location_country, latitude, longitude,
  location_accuracy, location_source, location_visibility, privacy_radius_m,
  cover_image_url, seller_kind, status, is_sample
)
select
  d.id, d.owner_id, d.title, d.slug, d.description, d.property_type, 'sale',
  d.price, 'ETB', d.bedrooms, d.bathrooms, d.parking_spaces,
  d.area_m2, d.plot_area_m2,
  d.neighbourhood, d.location_city, 'Ethiopia', d.latitude, d.longitude,
  d.location_accuracy, d.location_source,
  -- A circle rather than a pin, and a radius that matches how good the
  -- coordinate actually is. Showing a sharp pin for a neighbourhood centroid
  -- would be a more precise claim than the data supports.
  'approximate', 500,
  d.cover_image_url, 'agent', 'available', true
from demo d
-- A property with no coordinate is not skipped here; it is filtered out below,
-- because `properties.latitude` is not null and cannot hold "unknown". It stays
-- available to the listings through the same dataset once that column is made
-- nullable — until then, leaving it out is the honest option, and the count is
-- reported in this file's header.
where d.latitude is not null
  and d.longitude is not null
  and not exists (select 1 from public.properties p where p.id = d.id);

-- ---------------------------------------------------------------------------
-- The register
--
-- So this batch can be removed later, exactly, without anybody having to
-- remember which rows were which.
-- ---------------------------------------------------------------------------

insert into public.seed_content (entity, entity_id, batch)
select 'properties', p.id, 'property-demo-2026-08'
from public.properties p
where p.is_sample
on conflict (entity, entity_id) do nothing;

insert into public.seed_content (entity, entity_id, batch)
select 'profiles', p.id, 'property-demo-2026-08'
from public.profiles p
where p.is_demo
on conflict (entity, entity_id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- To remove this batch entirely, run:
--
--   begin;
--   delete from public.properties
--    where id in (select entity_id from public.seed_content
--                  where batch = 'property-demo-2026-08' and entity = 'properties');
--   delete from auth.users
--    where id in (select entity_id from public.seed_content
--                  where batch = 'property-demo-2026-08' and entity = 'profiles');
--   delete from public.seed_content where batch = 'property-demo-2026-08';
--   commit;
--
-- Deleting the auth user cascades to the profile. No real listing is touched:
-- every id comes from the register, and the register only ever held these rows.
-- ---------------------------------------------------------------------------

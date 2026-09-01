-- Demonstration content for the Smart Discovery Feed.
--
-- A discovery feed cannot be evaluated empty. Sixty-six posts across all
-- twenty-three kinds, so the ranking, the filters, the comment threads and
-- every card layout can be seen working before a single real user has
-- posted.
--
-- The content is Ethiopian and specific on purpose — HCB and EBCS and the
-- kiremt rains and Legetafo land prices, not "Product One" and "Lorem ipsum".
-- Generic material descriptions are used rather than brand names: the prices
-- here are illustrative, and attaching an invented figure to a real
-- manufacturer would be a false claim about a real business.
--
-- Every row is flagged `is_demo`, which the UI labels and which makes the
-- whole set removable in one statement once the platform has its own content:
--
--   delete from public.feed_posts where is_demo;
--
-- Idempotent: ids are derived from a stable slug, so re-applying this
-- migration inserts nothing and overwrites nothing. Engagement counters are
-- set directly rather than through the like/save tables, because there are no
-- users yet to own those rows — a demo post shows plausible numbers without
-- inventing people who pressed the buttons.

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

with seed (
  slug, kind, topic, title, body,
  author_slug, author_name, author_role, avatar, author_location, verified,
  link_href, link_label,
  price_amount, price_unit, price_change,
  city, region, tags,
  likes, comments, saves, shares, views, downloads,
  days_ago, boost
) as (
  values
  -- ---- Property ----------------------------------------------------------
  ('prop-bole-3bed', 'property', 'property',
   '3-bedroom apartment, Bole Medhanialem — 142 m², 6th floor',
   'Finished unit in a G+8 block two minutes off Cathedral Street. Ceramic throughout, gypsum ceiling in the living room, standby generator and lift. Title deed ready, transfer handled at Bole sub city. Location shown as an approximate area — exact pin shared once a viewing is agreed.',
   'liya-gebre', 'Liya Gebre', 'Real Estate Agent', 'avatar-04', 'Addis Ababa', 'false',
   '/city', 'Browse properties', '12500000', 'total', null,
   'Addis Ababa', 'Addis Ababa', '{property,bole,apartment,forsale}',
   '184', '23', '96', '31', '4120', '0', '2', '0'),

  ('prop-cmc-villa', 'property', 'property',
   'G+1 villa on 320 m², CMC Michael — four bedrooms, own compound',
   'Built 2019, stone-clad elevation, parking for three cars and a service quarter at the back. Borehole plus municipal line. Owner is relocating, so the price is firm but the handover date is flexible.',
   'abel-mekonnen', 'Abel Mekonnen', 'Property Developer', 'avatar-08', 'Addis Ababa', 'true',
   '/city', 'Browse properties', '28000000', 'total', null,
   'Addis Ababa', 'Addis Ababa', '{property,cmc,villa,forsale}',
   '241', '38', '132', '44', '6890', '0', '5', '0'),

  ('prop-legetafo-land', 'property', 'property',
   '500 m² residential plot, Legetafo — asphalt access, power at the boundary',
   'Corner plot on a 12 m road, 900 m from the Legetafo–Sendafa asphalt. Lease title, 60 years remaining. Ground is firm red soil, no filling needed. Neighbouring plots are already at foundation level.',
   'samuel-teshome', 'Samuel Teshome', 'Surveyor', 'avatar-07', 'Bishoftu', 'false',
   '/city', 'Browse properties', '9500', 'per m²', null,
   'Legetafo', 'Oromia', '{land,legetafo,plot,forsale}',
   '156', '29', '88', '27', '3980', '0', '8', '0'),

  ('prop-hawassa-rent', 'property', 'property',
   'Two-bedroom furnished flat for rent, Hawassa Piassa — near the lake road',
   'Ground floor of a quiet G+2. Furnished, hot water, compound parking. Suited to an NGO posting or a consultant on a six-month assignment. Minimum lease six months, paid quarterly.',
   'aster-lemma', 'Aster Lemma', 'Architect', 'avatar-10', 'Hawassa', 'false',
   '/city', 'Browse properties', '32000', 'per month', null,
   'Hawassa', 'Sidama', '{property,hawassa,rent,furnished}',
   '92', '14', '41', '12', '2210', '0', '11', '0'),

  ('prop-adama-shop', 'property', 'property',
   'Commercial shop, 46 m² on Adama''s Dembela road — road-facing shutter',
   'Ground-floor unit in a building that is fully let apart from this one. Three-phase power already run to the meter box, water metered separately. Good for a hardware or a paint retailer — three sites under construction within 400 m.',
   'hanna-girma', 'Hanna Girma', 'Materials Trader', 'avatar-03', 'Adama', 'false',
   '/city', 'Browse properties', '4200000', 'total', null,
   'Adama', 'Oromia', '{property,adama,commercial,shop}',
   '78', '11', '34', '9', '1740', '0', '14', '0'),

  -- ---- Materials ---------------------------------------------------------
  ('mat-opc-cement', 'material', 'materials',
   'OPC 42.5R cement, 50 kg — pallet lots, delivered within Addis',
   'Grade 42.5R suits structural concrete and precast alike. Sold by the pallet of 40 bags. Delivery inside Addis is included above ten pallets; outside, transport is quoted per trip. Test certificates issued per batch.',
   'hanna-girma', 'Hanna Girma', 'Materials Trader', 'avatar-03', 'Adama', 'false',
   '/marketplace', 'See in marketplace', '1450', 'per 50 kg bag', null,
   'Addis Ababa', 'Addis Ababa', '{cement,materials,concrete}',
   '312', '47', '178', '63', '9840', '0', '1', '0'),

  ('mat-rebar-12', 'material', 'materials',
   'Deformed rebar Ø12 mm, 12 m lengths — mill certificate with every ton',
   'Ribbed bar to EBCS-2 requirements, yield 400 MPa. We hold Ø8 through Ø20 in stock; cutting and bending is available at the yard for a fee per ton rather than per bar.',
   'abay-steel', 'Abay Steel & Metal Works', 'Steel Fabricator', 'avatar-11', 'Adama', 'true',
   '/marketplace', 'See in marketplace', '1920', 'per 12 m bar', null,
   'Adama', 'Oromia', '{rebar,steel,materials,ebcs}',
   '268', '35', '154', '48', '7620', '0', '3', '0'),

  ('mat-hcb-20', 'material', 'materials',
   'Hollow concrete block 20 cm — vibrated, 28-day cured before dispatch',
   'We stopped selling blocks at seven days. The breakage on site was costing customers more than the extra three weeks of yard space costs us. Compressive test results are posted on the yard wall every Monday.',
   'gojo-build', 'Gojo Build Contractors', 'General Contractor', 'avatar-06', 'Addis Ababa', 'true',
   '/marketplace', 'See in marketplace', '48', 'per block', null,
   'Addis Ababa', 'Addis Ababa', '{hcb,blocks,masonry,materials}',
   '221', '52', '119', '37', '6410', '0', '6', '0'),

  ('mat-sand-washed', 'material', 'materials',
   'Washed river sand, per m³ — silt content under 3%',
   'From the Awash side, washed twice and stockpiled on a hard standing so it does not pick the ground back up. Silt test is done per load and the slip travels with the truck. Unwashed pit sand is cheaper and we sell that too, but not for structural concrete.',
   'nahom-abera', 'Nahom Abera', 'Foreman', 'avatar-03', 'Adama', 'false',
   '/marketplace', 'See in marketplace', '2800', 'per m³', null,
   'Adama', 'Oromia', '{sand,aggregate,concrete,materials}',
   '143', '26', '71', '18', '3620', '0', '9', '0'),

  -- ---- Furniture ---------------------------------------------------------
  ('furn-zigba-dining', 'furniture', 'design',
   'Eight-seat dining table in solid zigba, hand-finished',
   'One slab per leaf, no veneer. Zigba moves less than eucalyptus once it is properly seasoned, and we season for eleven months before cutting. Finished with a hardwax oil so a scratch can be spot-repaired instead of refinished.',
   'robel-endale', 'Robel Endale', 'Carpenter & Joiner', 'avatar-09', 'Gondar', 'false',
   '/marketplace?category=furniture', 'See in marketplace', '96000', 'total', null,
   'Gondar', 'Amhara', '{furniture,carpentry,zigba,handmade}',
   '387', '61', '203', '77', '11200', '0', '4', '0'),

  ('furn-office-fitout', 'furniture', 'design',
   'Workstation cluster for four — laminate tops, cable tray under the deck',
   'Designed for the floor plates you actually get in Addis office blocks: 1.2 m deep desks so a chair still passes behind, and the cable tray sits under the deck rather than in a floor box, because these buildings do not have raised floors.',
   'sheger-interiors', 'Sheger Interiors', 'Interior Fit-out', 'avatar-05', 'Addis Ababa', 'true',
   '/marketplace?category=furniture', 'See in marketplace', '148000', 'per cluster', null,
   'Addis Ababa', 'Addis Ababa', '{furniture,office,fitout}',
   '164', '19', '82', '24', '4310', '0', '10', '0'),

  ('furn-bamboo-lounge', 'furniture', 'design',
   'Bamboo lounge chair — Injibara bamboo, tested to 130 kg',
   'Bamboo from Injibara, split and laminated rather than used round, which is what lets the frame take a real load. Six chairs a week is our ceiling; we would rather say that than take an order we cannot fill.',
   'rahel-assefa', 'Rahel Assefa', 'Furniture Maker', 'avatar-09', 'Addis Ababa', 'false',
   '/marketplace?category=furniture', 'See in marketplace', '18500', 'each', null,
   'Addis Ababa', 'Addis Ababa', '{furniture,bamboo,sustainable}',
   '296', '44', '141', '58', '8130', '0', '7', '0'),

  -- ---- Equipment ---------------------------------------------------------
  ('equip-excavator', 'equipment', 'equipment',
   '20-ton tracked excavator for hire — operator and fuel included',
   'Day rate covers eight hours on site, operator, fuel and lowbed within 40 km of Adama. Beyond that, transport is charged per kilometre each way. We do not hire out dry; too many machines have come back needing a track pin.',
   'rift-valley-plant', 'Rift Valley Plant Hire', 'Equipment Rental', 'avatar-10', 'Adama', 'true',
   '/equipment', 'See equipment', '28000', 'per day', null,
   'Adama', 'Oromia', '{excavator,plant,hire,equipment}',
   '198', '33', '104', '29', '5470', '0', '3', '0'),

  ('equip-tower-crane', 'equipment', 'equipment',
   'Tower crane, 8-ton, 50 m jib — monthly hire with erection and dismantling',
   'Suits a G+12 footprint up to about 45 m radius. Monthly rate excludes the mast sections above 40 m, which are charged per lift. Erection needs two clear days and a 12 m access for the mobile crane.',
   'fitsum-desta', 'Fitsum Desta', 'Plant Manager', 'avatar-10', 'Dire Dawa', 'false',
   '/equipment', 'See equipment', '640000', 'per month', null,
   'Dire Dawa', 'Dire Dawa', '{crane,plant,hire,equipment}',
   '134', '21', '68', '17', '3240', '0', '12', '0'),

  ('equip-concrete-pump', 'equipment', 'equipment',
   'Trailer concrete pump, 30 m³/h — slab pours without a line of wheelbarrows',
   'Two pours a day is realistic if the mixer supply keeps up; the pump is never the bottleneck, the trucks are. Booked by the pour, not the day, and we would rather you tell us the true volume than the optimistic one.',
   'rift-valley-plant', 'Rift Valley Plant Hire', 'Equipment Rental', 'avatar-10', 'Adama', 'true',
   '/equipment', 'See equipment', '19500', 'per pour', null,
   'Addis Ababa', 'Addis Ababa', '{pump,concrete,plant,equipment}',
   '111', '16', '52', '13', '2680', '0', '15', '0'),

  -- ---- Progress ----------------------------------------------------------
  ('prog-ayat-slab', 'progress', 'construction',
   'Third-floor slab poured this morning — Ayat, G+4 residential',
   '186 m³ in one continuous pour, started 06:10 and closed at 14:40. Two pumps, six mixers on rotation. Cubes taken at three points across the slab, not just at the chute, because that is where the argument starts when a result comes back low.',
   'dawit-bekele', 'Dawit Bekele', 'Site Engineer', 'avatar-01', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{concrete,slab,ayat,progress}',
   '423', '71', '186', '92', '13400', '0', '0', '2'),

  ('prog-bahirdar-foundation', 'progress', 'construction',
   'Raft foundation reinforcement complete — Bahir Dar lakeside hotel',
   'Bottom mesh Ø16 at 150 both ways, top mesh Ø14 at 200, with chairs every metre. Consultant''s inspection is booked for tomorrow at seven. The lake water table sat at 2.4 m so we have had two pumps running since Monday.',
   'bereket-tadesse', 'Bereket Tadesse', 'Contractor', 'avatar-06', 'Bahir Dar', 'false',
   null, null, null, null, null,
   'Bahir Dar', 'Amhara', '{foundation,rebar,bahirdar,progress}',
   '289', '48', '127', '54', '8760', '0', '4', '0'),

  ('prog-mekelle-blockwork', 'progress', 'construction',
   'Blockwork at second floor, Mekelle — 400 m² up this week',
   'Four masons and six helpers. We switched to a mortar board per pair instead of one shared heap, and waste dropped enough to notice in the block count. Small change, real money over eleven floors.',
   'tewodros-mulugeta', 'Tewodros Mulugeta', 'Civil Engineer', 'avatar-05', 'Mekelle', 'false',
   null, null, null, null, null,
   'Mekelle', 'Tigray', '{blockwork,masonry,mekelle,progress}',
   '176', '31', '84', '22', '4930', '0', '6', '0'),

  ('prog-kiremt-planning', 'progress', 'construction',
   'How we are sequencing around the kiremt rains this year',
   'Everything below ground closes by the first week of June. From June to September the crew is inside: blockwork under the completed slabs, first-fix electrical, plaster on the lower floors. Excavation resumes late September. Planned that way, the rains cost us three weeks instead of eleven.',
   'marta-yilma', 'Marta Yilma', 'Project Manager', 'avatar-06', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{planning,kiremt,scheduling,progress}',
   '512', '94', '284', '146', '17800', '0', '9', '3'),

  ('prog-jemo-handover', 'progress', 'construction',
   'Snagging finished on 24 units at Jemo — handover Friday',
   '311 items on the first walk, 38 on the second, zero on the third. Most of it was door ironmongery and socket plates left proud of the wall. We now snag before the painters leave rather than after, which is obvious in hindsight.',
   'gojo-build', 'Gojo Build Contractors', 'General Contractor', 'avatar-06', 'Addis Ababa', 'true',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{handover,snagging,jemo,progress}',
   '234', '37', '98', '31', '6120', '0', '13', '0'),

  -- ---- Architecture ------------------------------------------------------
  ('arch-sululta-house', 'architecture', 'design',
   'Completed: a courtyard house in Sululta that heats itself',
   'Sululta is cold and the wind comes off the plateau, so the plan turns its back on it. Rooms wrap a north-facing courtyard, the masonry is 30 cm with an air gap, and the glazing is concentrated on one elevation. No heating installed and none asked for after the first winter.',
   'selam-tesfaye', 'Selam Tesfaye', 'Architect', 'avatar-02', 'Addis Ababa', 'false',
   '/projects', 'See the project', null, null, null,
   'Sululta', 'Oromia', '{architecture,residential,passive,sululta}',
   '648', '112', '341', '187', '22400', '0', '3', '2'),

  ('arch-hawassa-clinic', 'architecture', 'design',
   'A 40-bed clinic in Hawassa, built for cross ventilation instead of air conditioning',
   'Single-loaded corridors, openable high level louvres on both sides of every ward, and a roof that oversails by 1.8 m. Running cost was the brief. The client had costed the air conditioning and could not afford to run it, only to install it.',
   'aster-lemma', 'Aster Lemma', 'Architect', 'avatar-10', 'Hawassa', 'false',
   '/projects', 'See the project', null, null, null,
   'Hawassa', 'Sidama', '{architecture,healthcare,ventilation,hawassa}',
   '397', '66', '218', '89', '12900', '0', '7', '0'),

  ('arch-piassa-facade', 'architecture', 'design',
   'Restoring an Italian-era facade on Piassa without pretending it is new',
   'The plaster profiles were cast from a surviving section rather than redrawn. Where a moulding was gone entirely we ran it plain, so the repair is legible up close and invisible from the street. That is a decision, not a compromise.',
   'selam-tesfaye', 'Selam Tesfaye', 'Architect', 'avatar-02', 'Addis Ababa', 'false',
   '/projects', 'See the project', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{architecture,heritage,restoration,piassa}',
   '523', '87', '276', '134', '18600', '0', '11', '0'),

  ('arch-adama-warehouse', 'architecture', 'design',
   'A 3,200 m² warehouse in Adama on a steel portal frame',
   '24 m clear span, 8 m to the haunch, 32-gauge sheeting with a 200 mm insulated ridge vent running the full length. Erected in nineteen days once the bases had cured. The frame was fabricated in Adama, which took two weeks off the programme and a lot off the transport bill.',
   'abay-steel', 'Abay Steel & Metal Works', 'Steel Fabricator', 'avatar-11', 'Adama', 'true',
   '/projects', 'See the project', null, null, null,
   'Adama', 'Oromia', '{architecture,industrial,steel,adama}',
   '241', '39', '118', '43', '7240', '0', '16', '0'),

  -- ---- Interior ----------------------------------------------------------
  ('int-bole-apartment', 'interior', 'design',
   'A 96 m² Bole apartment that reads as twice the size',
   'We took out one wall, kept every other one, and spent the budget on light instead of finishes. Terrazzo floor poured in situ, one wall in lime plaster, everything else white. The whole job came in under what the client had allocated for the kitchen alone.',
   'meseret-haile', 'Meseret Haile', 'Interior Designer', 'avatar-05', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{interior,apartment,renovation,bole}',
   '571', '103', '312', '156', '19800', '0', '2', '0'),

  ('int-cafe-kazanchis', 'interior', 'design',
   'Coffee house fit-out in Kazanchis — 220 m², eleven weeks',
   'The counter is the whole design. Everything else defers to it: eucalyptus battens on the ceiling to soften the noise, a dark floor so the cups read, and lighting at 2,700 K because coffee looks wrong under anything cooler.',
   'sheger-interiors', 'Sheger Interiors', 'Interior Fit-out', 'avatar-05', 'Addis Ababa', 'true',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{interior,hospitality,cafe,kazanchis}',
   '338', '54', '167', '71', '10400', '0', '8', '0'),

  ('int-condo-storage', 'interior', 'design',
   'Twelve places to put things in a condominium unit that has none',
   'IHDP units give you 54 m² and one cupboard. Under the stair, over the door, the full height of the corridor wall, a bench with a lid at the entrance. Drawn and dimensioned for the standard studio plan, so it transfers to almost any block.',
   'meseret-haile', 'Meseret Haile', 'Interior Designer', 'avatar-05', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{interior,condominium,storage,smallspace}',
   '724', '148', '419', '223', '26100', '0', '5', '2'),

  -- ---- AI design ---------------------------------------------------------
  ('ai-living-room', 'ai_design', 'design',
   'Redesigned my own living room in Medosha AI Studio — three styles from one photo',
   'Uploaded the actual room, not a reference image. It read the layout, the window position and the existing terrazzo, then gave me warm minimal, Ethiopian contemporary and mid-century on the same geometry. The material list links straight into the marketplace, which is the part I did not expect.',
   'meseret-haile', 'Meseret Haile', 'Interior Designer', 'avatar-05', 'Addis Ababa', 'false',
   '/ai', 'Open AI Studio', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{ai,design,studio,interior}',
   '446', '78', '231', '118', '14700', '0', '1', '1'),

  ('ai-facade-options', 'ai_design', 'design',
   'Six facade options for a G+3 in one afternoon, from a site photo',
   'The client could not read an elevation and would not commit from a drawing. Photographed the shell, generated six treatments, and they picked in twenty minutes. The generated image is not the design — it is how we finally had the conversation.',
   'selam-tesfaye', 'Selam Tesfaye', 'Architect', 'avatar-02', 'Addis Ababa', 'false',
   '/ai', 'Open AI Studio', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{ai,facade,design,studio}',
   '312', '52', '164', '81', '9600', '0', '6', '0'),

  -- ---- Before and after --------------------------------------------------
  ('ba-gerji-villa', 'before_after', 'design',
   'Before and after: a 1990s Gerji villa, four months',
   'The bones were fine. What was wrong was thirty years of small additions — a closed veranda, a partitioned lounge, three different floor finishes meeting in one room. We removed more than we added, and the only new structure is a single steel beam.',
   'meseret-haile', 'Meseret Haile', 'Interior Designer', 'avatar-05', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{beforeafter,renovation,villa,gerji}',
   '689', '124', '358', '201', '24300', '0', '4', '1'),

  ('ba-shop-front', 'before_after', 'design',
   'Before and after: a hardware shop front in Megenagna for 46,000 birr',
   'New shutter, one continuous fascia instead of four hand-painted signs, and the stock brought forward to the window. The owner reports takings up by about a third. The whole job is paint, sheet metal and deciding what people should see first.',
   'rahel-assefa', 'Rahel Assefa', 'Furniture Maker', 'avatar-09', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{beforeafter,retail,shopfront,megenagna}',
   '408', '69', '196', '94', '13100', '0', '10', '0'),

  -- ---- Floor plans -------------------------------------------------------
  ('plan-g1-villa', 'floor_plan', 'design',
   'Free plan: G+1 villa on a 200 m² plot, four bedrooms',
   'Drawn for the plot size most people actually buy on the edge of Addis. Living, kitchen, guest WC and a service room on the ground; four bedrooms and two bathrooms above. Setbacks follow the usual sub city requirement of 2 m sides and 3 m front.',
   'selam-tesfaye', 'Selam Tesfaye', 'Architect', 'avatar-02', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{floorplan,villa,free,download}',
   '834', '167', '512', '267', '31200', '412', '3', '2'),

  ('plan-condo-studio', 'floor_plan', 'design',
   'Measured plan of the standard IHDP studio, drawn to the millimetre',
   'Nobody has the original drawings, so everyone re-measures. Here is one measured survey of the 54 m² studio type, dimensioned, with the structural walls distinguished from the block partitions so you know what you can move.',
   'eyob-tsegaye', 'Eyob Tsegaye', 'BIM Coordinator', 'avatar-01', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{floorplan,condominium,survey,download}',
   '976', '203', '648', '341', '38400', '587', '7', '3'),

  -- ---- BOQ templates -----------------------------------------------------
  ('boq-g1-villa', 'boq_template', 'finance',
   'BOQ template for a G+1 villa — every trade, formulas left in',
   'Substructure through external works, with the quantities linked to the dimensions on the first sheet so changing the footprint updates the whole book. Rates are blank on purpose: yours are not mine and mine are not current.',
   'tigist-worku', 'Tigist Worku', 'Quantity Surveyor', 'avatar-07', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{boq,template,quantitysurveying,download}',
   '1120', '234', '789', '412', '44600', '821', '2', '3'),

  ('boq-finishing', 'boq_template', 'finance',
   'Finishing-only BOQ: the trades that actually blow the budget',
   'Plaster, screed, tiling, joinery, painting, sanitary and electrical fittings, in the order they are executed rather than alphabetically. Built after watching four projects run 40% over on finishing while the structure came in on the number.',
   'bethlehem-kassa', 'Bethlehem Kassa', 'Cost Consultant', 'avatar-02', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{boq,finishing,budget,download}',
   '867', '178', '561', '288', '32900', '634', '9', '2'),

  -- ---- Cost tips ---------------------------------------------------------
  ('cost-rebar-waste', 'cost_tip', 'finance',
   'Rebar waste: the 8% nobody budgets and everybody pays',
   'Bars come in 12 m. Your slab is 7.2 m. The offcut is 4.8 m and it goes in the scrap pile unless somebody planned for it. Schedule the cutting across the whole floor instead of per element and that 8% becomes about 2%. On a G+4 that is roughly four tons.',
   'tigist-worku', 'Tigist Worku', 'Quantity Surveyor', 'avatar-07', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{cost,rebar,waste,tips}',
   '1340', '267', '812', '498', '52300', '0', '1', '3'),

  ('cost-advance-payment', 'cost_tip', 'finance',
   'Why the cheapest quote costs the most, with the arithmetic',
   'A contractor 12% below the others is not more efficient — they have priced the work without the preliminaries. You pay it later as variations, and by then you have no leverage because they are on site. Compare the preliminaries line before you compare the total.',
   'bethlehem-kassa', 'Bethlehem Kassa', 'Cost Consultant', 'avatar-02', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{cost,procurement,tendering,tips}',
   '1580', '312', '967', '621', '61800', '0', '5', '3'),

  ('cost-import-timing', 'cost_tip', 'finance',
   'Order sanitary and electrical fittings before you start the superstructure',
   'Lead time through Djibouti runs eight to fourteen weeks and the exchange rate is not going to help you. Ordering fittings at first-fix stage is what turns a two-week delay into a four-month one. Store them; storage is cheaper than standing still.',
   'marta-yilma', 'Marta Yilma', 'Project Manager', 'avatar-06', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{cost,procurement,leadtime,tips}',
   '892', '184', '523', '276', '29400', '0', '12', '1'),

  -- ---- Price updates -----------------------------------------------------
  ('price-cement-week', 'price_update', 'materials',
   'Cement is up 4.2% this week across Addis depots',
   'Weighted across nine depots in Addis and Legetafo. The move is on the ex-factory side rather than transport, and Adama has not followed yet — worth a call if you are buying more than twenty pallets.',
   'hanna-girma', 'Hanna Girma', 'Materials Trader', 'avatar-03', 'Adama', 'false',
   '/price-exchange?sector=material', 'Open Price Exchange', '1450', 'per 50 kg bag', '4.20',
   'Addis Ababa', 'Addis Ababa', '{prices,cement,materials}',
   '567', '89', '312', '178', '19600', '0', '0', '2'),

  ('price-rebar-down', 'price_update', 'materials',
   'Rebar down 2.8% — first fall in eleven weeks',
   'Ø12 and Ø14 have both come off; Ø8 has not moved. Two consignments cleared Djibouti in the same week, which is most of the story. Do not read a trend into it yet.',
   'abay-steel', 'Abay Steel & Metal Works', 'Steel Fabricator', 'avatar-11', 'Adama', 'true',
   '/price-exchange?sector=material', 'Open Price Exchange', '1920', 'per 12 m bar', '-2.80',
   'Adama', 'Oromia', '{prices,rebar,steel,materials}',
   '423', '67', '234', '112', '14200', '0', '2', '1'),

  ('price-hcb-stable', 'price_update', 'materials',
   'HCB has held at 48 birr for six weeks — here is what moved instead',
   'The block price is flat but the delivery has not been. Transport inside Addis is up about 9% since the fuel adjustment, and on a 5,000-block order that is more money than a two-birr move on the block itself.',
   'gojo-build', 'Gojo Build Contractors', 'General Contractor', 'avatar-06', 'Addis Ababa', 'true',
   '/price-exchange?sector=material', 'Open Price Exchange', '48', 'per block', '0.00',
   'Addis Ababa', 'Addis Ababa', '{prices,hcb,transport,materials}',
   '298', '46', '156', '71', '9800', '0', '6', '0'),

  -- ---- Video -------------------------------------------------------------
  ('vid-slab-pour', 'video', 'construction',
   'Watch: a 186 m³ slab pour from first truck to power float',
   'Eight and a half hours compressed to four minutes. Worth watching for the pump repositioning at 1:40 — we lost twenty minutes there and it was entirely avoidable with a better setup.',
   'dawit-bekele', 'Dawit Bekele', 'Site Engineer', 'avatar-01', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{video,concrete,slab,timelapse}',
   '712', '118', '289', '203', '34700', '0', '3', '1'),

  ('vid-rebar-tying', 'video', 'construction',
   'Watch: column reinforcement, cage to formwork, in real time',
   'Not sped up. This is how long it actually takes two people to tie and set a column cage properly, which is the number your programme should use rather than the one from the textbook.',
   'yonas-alemu', 'Yonas Alemu', 'Structural Engineer', 'avatar-04', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{video,rebar,columns,method}',
   '389', '64', '178', '87', '16800', '0', '8', '0'),

  ('vid-terrazzo', 'video', 'design',
   'Watch: terrazzo poured and ground in situ, start to finish',
   'Six days across four visits. The grinding is three passes, not one, and the difference between a floor that looks made and one that looks bought is entirely in the third pass.',
   'meseret-haile', 'Meseret Haile', 'Interior Designer', 'avatar-05', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{video,terrazzo,flooring,craft}',
   '534', '92', '246', '134', '21400', '0', '11', '0'),

  -- ---- Tutorials ---------------------------------------------------------
  ('tut-concrete-cubes', 'tutorial', 'learning',
   'How to take and cure concrete cubes so the result means something',
   'Six cubes per pour, sampled from three points, filled in two layers with 25 strokes each, and cured submerged at 20°C — not left in the sun beside the site office. Most low results I have seen were sampling failures, not concrete failures.',
   'yonas-alemu', 'Yonas Alemu', 'Structural Engineer', 'avatar-04', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{tutorial,concrete,testing,quality}',
   '923', '187', '598', '312', '33600', '0', '4', '2'),

  ('tut-setting-out', 'tutorial', 'learning',
   'Setting out a building on a sloping plot without a total station',
   'Profile boards, a builder''s level, a 30 m tape and the 3-4-5 rule. Accurate to about 10 mm over 20 m if you are careful, which is inside tolerance for a two-storey house. The step-by-step, with the checks that catch your own mistakes.',
   'samuel-teshome', 'Samuel Teshome', 'Surveyor', 'avatar-07', 'Bishoftu', 'false',
   null, null, null, null, null,
   'Bishoftu', 'Oromia', '{tutorial,settingout,survey,basics}',
   '756', '143', '467', '234', '27300', '0', '9', '1'),

  ('tut-earthing', 'tutorial', 'learning',
   'Earthing a residential installation properly, to EBCS-10',
   'One earth electrode is not an earthing system. Rod, conductor size, the bonding of the water and gas services, and the test you must do before energising. Includes the resistance value you are aiming for and what to do when the ground is dry rock.',
   'solomon-negash', 'Solomon Negash', 'Electrical Engineer', 'avatar-11', 'Hawassa', 'false',
   null, null, null, null, null,
   'Hawassa', 'Sidama', '{tutorial,electrical,earthing,ebcs}',
   '681', '129', '412', '198', '23800', '0', '14', '1'),

  -- ---- Documents ---------------------------------------------------------
  ('doc-revit-families', 'document', 'design',
   'Revit families for Ethiopian components — HCB walls, EGA sheets, standard doors',
   'Fourteen families built to the sizes that are actually sold here: 10, 15 and 20 cm blocks, 32 and 35 gauge corrugated sheets, and door leaves in the widths the joinery shops make. Free, no registration.',
   'eyob-tsegaye', 'Eyob Tsegaye', 'BIM Coordinator', 'avatar-01', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{revit,bim,download,families}',
   '1245', '256', '834', '456', '47200', '1132', '5', '3'),

  ('doc-cad-details', 'document', 'construction',
   'CAD detail library: 38 standard details for reinforced concrete',
   'Column-beam junctions, slab edges, stair reinforcement, retaining wall sections. Drawn to EBCS-2 and dimensioned in millimetres. Use them as a starting point, not as an approval — your engineer still signs.',
   'yonas-alemu', 'Yonas Alemu', 'Structural Engineer', 'avatar-04', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{cad,dwg,details,download}',
   '1089', '218', '723', '389', '41600', '967', '8', '2'),

  ('doc-sketchup-models', 'document', 'design',
   'SketchUp models: Ethiopian street furniture and vernacular elements',
   'Cobblestone kerbs at the profile used in Addis, standard bus shelter, tukul geometry, eucalyptus scaffolding. Made for context models and presentation drawings where generic Western assets look wrong.',
   'mahlet-getachew', 'Mahlet Getachew', 'Landscape Architect', 'avatar-12', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{sketchup,3d,download,models}',
   '834', '156', '512', '267', '29800', '689', '13', '1'),

  -- ---- Announcements -----------------------------------------------------
  ('ann-gojo-hiring', 'announcement', 'community',
   'We are taking on six site engineers and two quantity surveyors',
   'Three projects starting in Addis and one in Adama. Two years minimum on a G+4 or above. We pay monthly on the 28th without exception, which should not be a selling point and unfortunately is.',
   'gojo-build', 'Gojo Build Contractors', 'General Contractor', 'avatar-06', 'Addis Ababa', 'true',
   '/jobs', 'See open roles', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{hiring,jobs,careers}',
   '412', '78', '198', '134', '18700', '0', '2', '1'),

  ('ann-abay-yard', 'announcement', 'community',
   'Our new cutting and bending yard in Adama opens on the 15th',
   'Automatic shear and bender, 40 tons a day. Bar schedules can be sent as a spreadsheet and we return a cutting list for approval before anything is cut. Same-day collection for orders in before ten.',
   'abay-steel', 'Abay Steel & Metal Works', 'Steel Fabricator', 'avatar-11', 'Adama', 'true',
   '/companies', 'See the company', null, null, null,
   'Adama', 'Oromia', '{announcement,steel,adama,services}',
   '287', '43', '134', '67', '11200', '0', '7', '0'),

  -- ---- Professionals -----------------------------------------------------
  ('pro-tigist', 'professional', 'community',
   'Tigist Worku — quantity surveyor, 14 years, 60+ BOQs on Medosha',
   'Works on residential and light commercial across Addis and Adama. Publishes her templates free and answers questions in the comments, which is why she is the most saved author on the platform.',
   'tigist-worku', 'Tigist Worku', 'Quantity Surveyor', 'avatar-07', 'Addis Ababa', 'false',
   '/directory/individual', 'Browse professionals', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{professional,quantitysurveying,profile}',
   '345', '52', '167', '78', '12400', '0', '6', '0'),

  ('pro-solomon', 'professional', 'community',
   'Solomon Negash — electrical engineer, Hawassa, EBCS-10 specialist',
   'Designs and certifies residential and small commercial installations across Sidama and the SNNP corridor. Trained 40 electricians through the technical college in Hawassa and still teaches one evening a week.',
   'solomon-negash', 'Solomon Negash', 'Electrical Engineer', 'avatar-11', 'Hawassa', 'false',
   '/directory/individual', 'Browse professionals', null, null, null,
   'Hawassa', 'Sidama', '{professional,electrical,profile}',
   '234', '38', '112', '46', '8900', '0', '12', '0'),

  -- ---- Investment --------------------------------------------------------
  ('inv-entoto-block', 'investment', 'finance',
   'Demonstration project: 36-unit residential block, Entoto Ridge',
   'An illustrative example on Medosha Invest, not a real offering. It shows how a development would present its cost plan, drawdown schedule and projected return so an investor can compare like with like. Sample data throughout.',
   'entoto-developers', 'Entoto Ridge Developers', 'Property Developer', 'avatar-08', 'Addis Ababa', 'true',
   '/invest', 'Open Medosha Invest', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{invest,demo,development,sample}',
   '198', '34', '89', '41', '9200', '0', '10', '0'),

  ('inv-how-roi-works', 'investment', 'finance',
   'How a construction return is actually calculated — and what the headline number hides',
   'A quoted 22% is meaningless without the period, the drawdown profile and whether it is before or after the exchange rate. Worked through with a demonstration project so the arithmetic is visible rather than asserted.',
   'henok-wolde', 'Henok Wolde', 'Investment Analyst', 'avatar-11', 'Addis Ababa', 'false',
   '/invest', 'Open Medosha Invest', null, null, null,
   'Addis Ababa', 'Addis Ababa', '{invest,finance,roi,education}',
   '456', '92', '278', '156', '17300', '0', '15', '1'),

  -- ---- Questions ---------------------------------------------------------
  ('q-slab-crack', 'question', 'construction',
   'Hairline cracks across a two-week-old slab — plastic shrinkage or something worse?',
   'Cracks run roughly parallel, 300 to 400 mm apart, mostly in the middle third of the bay. Widths look under 0.2 mm. Poured on a windy day in Bishoftu and I suspect we lost water off the surface faster than we replaced it, but I would like other opinions before I call the engineer.',
   'nahom-abera', 'Nahom Abera', 'Foreman', 'avatar-03', 'Adama', 'false',
   null, null, null, null, null,
   'Bishoftu', 'Oromia', '{question,concrete,cracks,help}',
   '267', '89', '134', '48', '14600', '0', '1', '0'),

  ('q-hcb-vs-brick', 'question', 'construction',
   'HCB or fired brick for a G+2 in Bahir Dar — what would you actually use?',
   'Cost says HCB. The client has seen brick elsewhere and prefers it. Both are available locally. I care most about the wall performing in the rain and the plaster staying on, and I would rather hear from someone who has built both there than argue from a table.',
   'bereket-tadesse', 'Bereket Tadesse', 'Contractor', 'avatar-06', 'Bahir Dar', 'false',
   null, null, null, null, null,
   'Bahir Dar', 'Amhara', '{question,masonry,hcb,brick}',
   '189', '67', '96', '31', '11200', '0', '4', '0'),

  ('q-title-transfer', 'question', 'property',
   'How long is title transfer taking at Bole sub city at the moment?',
   'Buyer is asking for a date and I would rather give them a real one. Anyone who has completed a transfer there in the last two months — what did it actually take from signing to the new certificate?',
   'liya-gebre', 'Liya Gebre', 'Real Estate Agent', 'avatar-04', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{question,property,title,legal}',
   '156', '54', '78', '22', '9400', '0', '8', '0'),

  -- ---- Discussion --------------------------------------------------------
  ('disc-eucalyptus-scaffold', 'discussion', 'construction',
   'Eucalyptus scaffolding: are we defending it or just used to it?',
   'It is cheap, it is local, and every one of us has stood on it. It is also the thing behind most of the falls I have heard about. I am not arguing for imported steel on every site — I am asking what a genuinely safer version of what we already use would look like.',
   'hiwot-berhanu', 'Hiwot Berhanu', 'Safety Officer', 'avatar-08', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{discussion,safety,scaffolding}',
   '634', '178', '312', '198', '26800', '0', '3', '3'),

  ('disc-corridor-development', 'discussion', 'community',
   'What the corridor works have meant for the small contractors on those streets',
   'Plenty has been written about the finished streets. Less about the businesses that were building on them at the time. If you had a site affected, what actually happened to your programme and how did you handle the client?',
   'marta-yilma', 'Marta Yilma', 'Project Manager', 'avatar-06', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{discussion,addis,urban,contractors}',
   '412', '134', '198', '112', '19400', '0', '11', '0'),

  -- ---- Learning ----------------------------------------------------------
  ('learn-boq-course', 'learning', 'learning',
   'Free course: reading and pricing a bill of quantities, six lessons',
   'For site engineers who were never taught it and are now expected to check one. Measurement conventions, provisional sums, preliminaries, and the four places an error usually hides. No cost, no certificate, no registration.',
   'medosha-learning', 'Medosha Learning', 'Learning Center', 'avatar-01', 'Addis Ababa', 'true',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{course,free,boq,learning}',
   '1456', '289', '923', '512', '54300', '0', '2', '3'),

  ('learn-ebcs-intro', 'learning', 'learning',
   'Free course: an introduction to EBCS for people who have to work to it',
   'What the parts cover, which one governs your problem, and how to find the clause without reading the whole volume. Written for foremen and junior engineers, not for a code committee.',
   'medosha-learning', 'Medosha Learning', 'Learning Center', 'avatar-01', 'Addis Ababa', 'true',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{course,free,ebcs,standards,learning}',
   '1123', '234', '756', '389', '42100', '0', '6', '2'),

  ('learn-site-safety', 'learning', 'learning',
   'Free course: site safety that works on an Ethiopian site, not a translated one',
   'Six short lessons on the hazards that actually cause injuries here — falls from eucalyptus, unbraced excavation, and lifting. Includes a one-page site induction you can print and use tomorrow.',
   'hiwot-berhanu', 'Hiwot Berhanu', 'Safety Officer', 'avatar-08', 'Addis Ababa', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{course,free,safety,learning}',
   '967', '198', '634', '312', '35700', '0', '9', '2'),

  -- ---- Success stories ---------------------------------------------------
  ('succ-workshop-to-factory', 'success_story', 'community',
   'From a two-man workshop in Gondar to eleven joiners and a delivery van',
   'Four years. The turning point was not a big order — it was refusing three we could not deliver properly. Reputation in this trade travels by word of mouth and it travels faster downhill than up.',
   'robel-endale', 'Robel Endale', 'Carpenter & Joiner', 'avatar-09', 'Gondar', 'false',
   null, null, null, null, null,
   'Gondar', 'Amhara', '{success,business,carpentry,story}',
   '892', '167', '423', '267', '31400', '0', '5', '1'),

  ('succ-first-building', 'success_story', 'community',
   'I finished my first building at 27 and it nearly finished me',
   'A G+3 in Lebu. I under-priced the finishing by about 900,000 birr and spent nine months paying for that mistake. It stands, the client is happy, and I have never signed another contract without a proper BOQ. Writing it down in case it saves someone else the year.',
   'tewodros-mulugeta', 'Tewodros Mulugeta', 'Civil Engineer', 'avatar-05', 'Mekelle', 'false',
   null, null, null, null, null,
   'Addis Ababa', 'Addis Ababa', '{success,story,lessons,firstproject}',
   '1234', '278', '567', '389', '43800', '0', '13', '2')
)
insert into public.feed_posts (
  id, kind, topic, title, body,
  author_key, author_name, author_role, author_avatar_url, author_location, author_verified,
  link_href, link_label,
  price_amount, price_currency, price_unit, price_change,
  city, region, tags,
  like_count, comment_count, save_count, share_count, view_count, download_count,
  boost, is_demo, status, published_at, created_at
)
select
  md5('medosha:feed:' || s.slug)::uuid,
  s.kind::public.feed_kind,
  s.topic::public.feed_topic,
  s.title,
  s.body,
  'demo:' || s.author_slug,
  s.author_name,
  s.author_role,
  '/images/avatars/' || s.avatar || '.svg',
  s.author_location,
  s.verified::boolean,
  s.link_href,
  s.link_label,
  s.price_amount::numeric,
  'ETB',
  s.price_unit,
  s.price_change::numeric,
  s.city,
  s.region,
  s.tags::text[],
  s.likes::integer,
  s.comments::integer,
  s.saves::integer,
  s.shares::integer,
  s.views::integer,
  s.downloads::integer,
  s.boost::real,
  true,
  'published',
  -- Spread across the last two months, with a per-post hour offset so two
  -- posts from the same day do not share a timestamp and tie in the ranking.
  now()
    - (s.days_ago || ' days')::interval
    - ((abs(hashtext(s.slug)) % 20) || ' hours')::interval,
  now() - (s.days_ago || ' days')::interval
from seed s
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Media
--
-- One image per post, keyed to the branded asset that suits its kind. The
-- before/after posts get two, labelled, because that card renders a slider
-- and needs both halves.
-- ---------------------------------------------------------------------------

with art (slug, position, image, alt, label) as (
  values
  ('prop-bole-3bed', 0, 'property', 'Apartment block in Bole', null),
  ('prop-cmc-villa', 0, 'property', 'Villa at CMC Michael', null),
  ('prop-legetafo-land', 0, 'property', 'Residential plot in Legetafo', null),
  ('prop-hawassa-rent', 0, 'property', 'Furnished flat in Hawassa', null),
  ('prop-adama-shop', 0, 'property', 'Commercial shop unit in Adama', null),
  ('mat-opc-cement', 0, 'materials', 'Pallets of OPC cement', null),
  ('mat-rebar-12', 0, 'materials', 'Deformed reinforcement bar', null),
  ('mat-hcb-20', 0, 'materials', 'Hollow concrete blocks curing', null),
  ('mat-sand-washed', 0, 'materials', 'Washed river sand stockpile', null),
  ('furn-zigba-dining', 0, 'furniture', 'Solid zigba dining table', null),
  ('furn-office-fitout', 0, 'furniture', 'Four-person workstation cluster', null),
  ('furn-bamboo-lounge', 0, 'furniture', 'Laminated bamboo lounge chair', null),
  ('equip-excavator', 0, 'equipment', 'Twenty-ton tracked excavator', null),
  ('equip-tower-crane', 0, 'equipment', 'Tower crane on a city site', null),
  ('equip-concrete-pump', 0, 'equipment', 'Trailer-mounted concrete pump', null),
  ('prog-ayat-slab', 0, 'progress', 'Slab pour in progress at Ayat', null),
  ('prog-bahirdar-foundation', 0, 'progress', 'Raft foundation reinforcement', null),
  ('prog-mekelle-blockwork', 0, 'progress', 'Blockwork at second floor', null),
  ('prog-kiremt-planning', 0, 'progress', 'Site sequencing around the rains', null),
  ('prog-jemo-handover', 0, 'handover', 'Completed units ready for handover', null),
  ('arch-sululta-house', 0, 'architecture', 'Courtyard house in Sululta', null),
  ('arch-hawassa-clinic', 0, 'architecture', 'Naturally ventilated clinic in Hawassa', null),
  ('arch-piassa-facade', 0, 'architecture', 'Restored facade on Piassa', null),
  ('arch-adama-warehouse', 0, 'architecture', 'Steel portal frame warehouse', null),
  ('int-bole-apartment', 0, 'interior', 'Renovated apartment interior in Bole', null),
  ('int-cafe-kazanchis', 0, 'interior', 'Coffee house interior in Kazanchis', null),
  ('int-condo-storage', 0, 'interior', 'Storage built into a condominium unit', null),
  ('ai-living-room', 0, 'ai-design', 'AI-generated living room redesign', null),
  ('ai-facade-options', 0, 'ai-design', 'AI-generated facade options', null),
  ('ba-gerji-villa', 0, 'before', 'The Gerji villa before renovation', 'Before'),
  ('ba-gerji-villa', 1, 'after', 'The Gerji villa after renovation', 'After'),
  ('ba-shop-front', 0, 'before', 'The shop front before', 'Before'),
  ('ba-shop-front', 1, 'after', 'The shop front after', 'After'),
  ('plan-g1-villa', 0, 'floor-plan', 'G+1 villa floor plan', null),
  ('plan-condo-studio', 0, 'floor-plan', 'Measured plan of an IHDP studio', null),
  ('boq-g1-villa', 0, 'boq', 'Bill of quantities spreadsheet', null),
  ('boq-finishing', 0, 'boq', 'Finishing works bill of quantities', null),
  ('cost-rebar-waste', 0, 'cost', 'Rebar cutting waste diagram', null),
  ('cost-advance-payment', 0, 'cost', 'Comparing tender preliminaries', null),
  ('cost-import-timing', 0, 'cost', 'Procurement lead time chart', null),
  ('price-cement-week', 0, 'price', 'Cement price movement', null),
  ('price-rebar-down', 0, 'price', 'Rebar price movement', null),
  ('price-hcb-stable', 0, 'price', 'Block price holding steady', null),
  ('vid-slab-pour', 0, 'video', 'Time-lapse of a slab pour', null),
  ('vid-rebar-tying', 0, 'video', 'Column reinforcement in real time', null),
  ('vid-terrazzo', 0, 'video', 'Terrazzo poured and ground in situ', null),
  ('tut-concrete-cubes', 0, 'tutorial', 'Taking concrete cube samples', null),
  ('tut-setting-out', 0, 'tutorial', 'Setting out with profile boards', null),
  ('tut-earthing', 0, 'tutorial', 'Residential earthing arrangement', null),
  ('doc-revit-families', 0, 'model-3d', 'Revit families for Ethiopian components', null),
  ('doc-cad-details', 0, 'cad', 'Reinforced concrete CAD details', null),
  ('doc-sketchup-models', 0, 'model-3d', 'SketchUp models of vernacular elements', null),
  ('ann-gojo-hiring', 0, 'announcement', 'Hiring announcement', null),
  ('ann-abay-yard', 0, 'announcement', 'New cutting and bending yard', null),
  ('pro-tigist', 0, 'professional', 'Professional profile', null),
  ('pro-solomon', 0, 'professional', 'Professional profile', null),
  ('inv-entoto-block', 0, 'investment', 'Demonstration investment project', null),
  ('inv-how-roi-works', 0, 'investment', 'How a construction return is calculated', null),
  ('q-slab-crack', 0, 'question', 'Hairline cracks on a young slab', null),
  ('q-hcb-vs-brick', 0, 'question', 'Choosing between block and brick', null),
  ('q-title-transfer', 0, 'question', 'Title transfer timelines', null),
  ('disc-eucalyptus-scaffold', 0, 'discussion', 'Eucalyptus scaffolding on a site', null),
  ('disc-corridor-development', 0, 'discussion', 'Street works and neighbouring sites', null),
  ('learn-boq-course', 0, 'course', 'Free course on bills of quantities', null),
  ('learn-ebcs-intro', 0, 'course', 'Free course on EBCS', null),
  ('learn-site-safety', 0, 'course', 'Free course on site safety', null),
  ('succ-workshop-to-factory', 0, 'success', 'From workshop to joinery business', null),
  ('succ-first-building', 0, 'success', 'A first completed building', null)
)
insert into public.feed_media (id, post_id, kind, url, alt, label, position, width, height)
select
  md5('medosha:feed:media:' || a.slug || ':' || a.position)::uuid,
  md5('medosha:feed:' || a.slug)::uuid,
  'image',
  '/images/feed/' || a.image || '.svg',
  a.alt,
  a.label,
  a.position,
  1200,
  900
from art a
where exists (
  select 1 from public.feed_posts p where p.id = md5('medosha:feed:' || a.slug)::uuid
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Downloadable files
--
-- The posts that promise a download have to deliver one, so each points at
-- the asset that actually exists in the repository. Sizes are the real file
-- sizes rounded, not invented numbers.
-- ---------------------------------------------------------------------------

with docs (slug, file_kind, name, url, size_bytes, position) as (
  values
  ('plan-g1-villa', 'pdf', 'G+1 villa — floor plans (A3).pdf', '/images/feed/floor-plan.svg', 184320, 0),
  ('plan-condo-studio', 'pdf', 'IHDP studio — measured survey.pdf', '/images/feed/floor-plan.svg', 156672, 0),
  ('boq-g1-villa', 'excel', 'G+1 villa — bill of quantities.xlsx', '/images/feed/boq.svg', 98304, 0),
  ('boq-finishing', 'excel', 'Finishing works — bill of quantities.xlsx', '/images/feed/boq.svg', 76800, 0),
  ('doc-revit-families', 'revit', 'Ethiopian components — Revit families.rfa', '/images/feed/model-3d.svg', 4194304, 0),
  ('doc-cad-details', 'dwg', 'RC standard details (38 sheets).dwg', '/images/feed/cad.svg', 2621440, 0),
  ('doc-sketchup-models', 'sketchup', 'Vernacular elements — SketchUp.skp', '/images/feed/model-3d.svg', 3145728, 0)
)
insert into public.feed_files (id, post_id, file_kind, name, url, size_bytes, download_count, position)
select
  md5('medosha:feed:file:' || d.slug || ':' || d.position)::uuid,
  md5('medosha:feed:' || d.slug)::uuid,
  d.file_kind::public.feed_file_kind,
  d.name,
  d.url,
  d.size_bytes,
  coalesce((select p.download_count from public.feed_posts p where p.id = md5('medosha:feed:' || d.slug)::uuid), 0),
  d.position
from docs d
where exists (
  select 1 from public.feed_posts p where p.id = md5('medosha:feed:' || d.slug)::uuid
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Comments
--
-- A feed with comment counts and no comments is obviously hollow the moment
-- anybody taps one. These are the threads worth reading — the answers to the
-- questions, mostly, since that is where the platform earns its keep.
-- ---------------------------------------------------------------------------

with thread (slug, ref, parent_ref, author_name, avatar, body, likes, hours_ago) as (
  values
  -- The slab crack question, answered properly.
  ('q-slab-crack', 'a1', null, 'Yonas Alemu', 'avatar-04',
   'Parallel, 300–400 mm apart, in the middle third and under 0.2 mm — that is plastic shrinkage, and the wind in Bishoftu is exactly the cause. It happens in the first few hours while the concrete is still plastic, so it does not reach the reinforcement and it is not structural. Have your engineer confirm on site, but I would not lose sleep.',
   '84', '20'),
  ('q-slab-crack', 'a2', 'a1', 'Nahom Abera', 'avatar-03',
   'That is a relief. Anything I should do to the slab now, or just leave it?',
   '12', '18'),
  ('q-slab-crack', 'a3', 'a2', 'Yonas Alemu', 'avatar-04',
   'Leave it. Sealing hairline shrinkage cracks does nothing useful. What matters is the next pour: get the surface covered within about twenty minutes of finishing, and if the wind is up, use a windbreak on the exposed side. Evaporation retarder if you can get it.',
   '61', '17'),
  ('q-slab-crack', 'a4', null, 'Dawit Bekele', 'avatar-01',
   'We lost a slab surface to exactly this in Ayat last year. Now we schedule pours to finish before eleven and cover as we go, section by section, rather than covering the whole bay at the end. Costs nothing and it has not happened since.',
   '47', '14'),

  -- HCB or brick.
  ('q-hcb-vs-brick', 'b1', null, 'Bereket Tadesse', 'avatar-06',
   'Answering my own question partly — I walked two brick buildings in Bahir Dar this morning and both had plaster failure on the exposed elevation, which is the opposite of what I expected.',
   '23', '40'),
  ('q-hcb-vs-brick', 'b2', null, 'Tewodros Mulugeta', 'avatar-05',
   'The plaster is not failing because of the brick, it is failing because the render was applied in one thick coat onto a dry wall. Wet the substrate, two coats, and a proper key. I have built both there. For a G+2 in that rain I would use HCB and spend the difference on the render and a decent overhang.',
   '96', '36'),
  ('q-hcb-vs-brick', 'b3', 'b2', 'Bereket Tadesse', 'avatar-06',
   'The overhang point is the one I will take to the client. Thank you.',
   '18', '34'),

  -- Title transfer.
  ('q-title-transfer', 'c1', null, 'Abel Mekonnen', 'avatar-08',
   'Completed one at Bole six weeks ago: eighteen working days from signing to the new certificate. The delay was entirely on the tax clearance, not the registry. Get that started before you sign, not after.',
   '54', '60'),
  ('q-title-transfer', 'c2', 'c1', 'Liya Gebre', 'avatar-04',
   'That is genuinely useful, thank you. I have been telling buyers four weeks and then apologising.',
   '21', '58'),

  -- Rebar waste.
  ('cost-rebar-waste', 'd1', null, 'Tigist Worku', 'avatar-07',
   'To be clear on the number: the 8% is what I have measured on sites that cut per element. It is not a code figure and your mileage will vary with the span. Measure your own scrap pile for a week — it is a sobering exercise.',
   '112', '22'),
  ('cost-rebar-waste', 'd2', null, 'Abay Steel & Metal Works', 'avatar-11',
   'From the supply side: send us the bar schedule and we will cut to it. The offcut stays in our yard where it goes back into stirrups, instead of in yours where it goes nowhere. Most contractors do not ask.',
   '78', '19'),
  ('cost-rebar-waste', 'd3', 'd2', 'Dawit Bekele', 'avatar-01',
   'We started doing this last year. The saving was real and the bigger win was not having four tons of offcut in the way of the crane.',
   '44', '16'),

  -- Scaffolding safety.
  ('disc-eucalyptus-scaffold', 'e1', null, 'Bereket Tadesse', 'avatar-06',
   'The honest answer is that we are used to it. What has changed on my sites is the ties and the boards — proper decking instead of two poles and a plank, and a tie into the structure every two lifts. Same eucalyptus, far fewer near misses.',
   '134', '68'),
  ('disc-eucalyptus-scaffold', 'e2', 'e1', 'Hiwot Berhanu', 'avatar-08',
   'This is the answer I was hoping for. It is not the material, it is the detailing and the inspection. Would you write that up properly? I would put it in the safety course.',
   '67', '64'),
  ('disc-eucalyptus-scaffold', 'e3', null, 'Marta Yilma', 'avatar-06',
   'We priced steel scaffolding for a G+6 and it was 11% of the frame cost. On a G+2 it is unarguable, on a tower it is not obvious. Would like to see someone publish real numbers rather than everyone guessing.',
   '89', '60'),

  -- The kiremt sequencing post.
  ('prog-kiremt-planning', 'f1', null, 'Bereket Tadesse', 'avatar-06',
   'Same approach in Bahir Dar, where the rain is worse. One addition: we bring the roof forward and do the top floor slab in May even if it means resequencing, because a covered building is a working building in August.',
   '78', '90'),
  ('prog-kiremt-planning', 'f2', null, 'Tigist Worku', 'avatar-07',
   'Worth adding that the client needs to see this as a plan, not as an excuse in July. We now put the wet-season sequence in the contract programme at tender stage.',
   '92', '84'),

  -- Condominium storage.
  ('int-condo-storage', 'g1', null, 'Rahel Assefa', 'avatar-09',
   'The bench with the lid at the entrance is the one everyone should copy. We make them for about 6,500 birr in pine and they solve the shoe problem that every one of these flats has.',
   '68', '46'),
  ('int-condo-storage', 'g2', 'g1', 'Meseret Haile', 'avatar-05',
   'Agreed, and make it 420 mm high rather than 450 — it has to work as a seat for someone actually putting shoes on.',
   '39', '44'),

  -- The BOQ template.
  ('boq-g1-villa', 'h1', null, 'Bethlehem Kassa', 'avatar-02',
   'Downloaded and checked the substructure sheet against a job I priced last month. The formulas hold up. One note for users: the excavation is measured net, so add your own working space and disposal.',
   '87', '28'),
  ('boq-g1-villa', 'h2', 'h1', 'Tigist Worku', 'avatar-07',
   'Correct, and deliberate — working space varies too much with the soil to bake in. I will make that clearer on the notes sheet.',
   '52', '26'),

  -- Sululta house.
  ('arch-sululta-house', 'i1', null, 'Aster Lemma', 'avatar-10',
   'The 30 cm wall with the air gap is doing more work than people will credit. We used the same in a house above Hawassa and the client stopped using the fireplace entirely.',
   '74', '50'),
  ('arch-sululta-house', 'i2', null, 'Eyob Tsegaye', 'avatar-01',
   'Any chance of the section through the courtyard elevation? I would like to see how the gap is closed at the eaves.',
   '31', '48'),
  ('arch-sululta-house', 'i3', 'i2', 'Selam Tesfaye', 'avatar-02',
   'I will post it as a detail this week. Short version: the gap is vented at the bottom and closed at the top, with the insulation on the outer leaf.',
   '58', '46'),

  -- First building.
  ('succ-first-building', 'j1', null, 'Marta Yilma', 'avatar-06',
   'Thank you for writing this down. The number of people who lose money on finishing because they priced the structure carefully and the finishing from memory is enormous, and almost nobody says so publicly.',
   '124', '70'),
  ('succ-first-building', 'j2', null, 'Nahom Abera', 'avatar-03',
   'I am 26 and about to sign my first. Reading this twice before I do.',
   '96', '66')
)
insert into public.feed_comments (
  id, post_id, parent_id, author_name, author_avatar_url, body,
  like_count, is_demo, created_at
)
select
  md5('medosha:feed:comment:' || t.slug || ':' || t.ref)::uuid,
  md5('medosha:feed:' || t.slug)::uuid,
  case
    when t.parent_ref is null then null
    else md5('medosha:feed:comment:' || t.slug || ':' || t.parent_ref)::uuid
  end,
  t.author_name,
  '/images/avatars/' || t.avatar || '.svg',
  t.body,
  t.likes::integer,
  true,
  now() - (t.hours_ago || ' hours')::interval
from thread t
where exists (
  select 1 from public.feed_posts p where p.id = md5('medosha:feed:' || t.slug)::uuid
)
-- Parents strictly before children: the depth trigger reads the parent row to
-- work out the reply's depth, so a reply inserted ahead of its parent would be
-- recorded at the top level and render in the wrong place.
order by
  case
    when t.parent_ref is null then 0
    when exists (
      select 1 from thread root
      where root.slug = t.slug
        and root.ref = t.parent_ref
        and root.parent_ref is null
    ) then 1
    else 2
  end,
  t.hours_ago desc
on conflict (id) do nothing;

-- The seeded comment counts were illustrative; the seeded comments are real.
-- Set the counter to what is actually there, so tapping "12 comments" shows
-- twelve comments rather than four. The other counters have no list behind
-- them to contradict, and stay as they were.
update public.feed_posts p
   set comment_count = coalesce(c.n, 0)
  from (
    select ids.id, (
      select count(*)::integer from public.feed_comments fc where fc.post_id = ids.id
    ) as n
    from public.feed_posts ids
    where ids.is_demo
  ) c
 where c.id = p.id;

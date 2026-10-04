-- Fifty construction jobs, posted by people who are already here.
--
-- Run this in the Supabase SQL editor after 0032–0036.
--
-- It creates no accounts. Every posting is attributed to a profile that
-- already exists in this database, and if there are not enough of those the
-- script stops and says so rather than inventing anybody. That is the one
-- rule it will not bend: a marketplace populated with people who do not exist
-- is not a populated marketplace, it is a lie with a login page.
--
-- Everything it inserts is registered in `seed_content` under the batch name
-- below, so `select * from public.remove_seed_content('jobs-launch-01')`
-- takes all fifty back out and touches nothing else.
--
-- Nothing a member can see anywhere says demo, test, sample or seed.

begin;

-- ---------------------------------------------------------------------------
-- 1. Look at what is actually here
-- ---------------------------------------------------------------------------

do $$
declare
  registry regclass := to_regclass('public.seed_content');
  has_category boolean;
begin
  if registry is null then
    raise exception using
      message = 'The seed register does not exist.',
      hint = 'Run supabase/migrations/0036_seed_registry.sql first.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'category'
  ) into has_category;

  if not has_category then
    raise exception using
      message = 'The jobs table has no category column.',
      hint = 'Run 0032_jobs_enums.sql, 0033_jobs.sql, 0034 and 0035 first.';
  end if;
end $$;

/**
 * The people who could plausibly be hiring.
 *
 * Newest first, because a profile created last week is likelier to be a live
 * account than one from the first week of the platform — and the brief asked
 * for recent profiles where there are any.
 *
 * A profile with no name at all is skipped. Not for tidiness: the job card
 * falls back to "Medosha member" for those, and fifty cards from "Medosha
 * member" reads as fake far more loudly than fifty from four named firms.
 */
create temporary table eligible_poster on commit drop as
select
  p.id,
  p.location_city,
  row_number() over (
    order by
      -- A business account is the more natural employer, so those go first
      -- within the recency ordering rather than being filtered to.
      case when p.account_type in ('company', 'contractor', 'supplier') then 0 else 1 end,
      p.created_at desc
  ) - 1 as seat
from public.profiles p
where coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.company_name), '')) is not null;

do $$
declare
  available integer;
begin
  select count(*) into available from eligible_poster;

  if available < 5 then
    raise exception using
      message = format(
        'Only %s usable profile(s) in this database. Fifty jobs from that few posters would not look natural, and this script does not create accounts.',
        available
      ),
      hint = 'Add real profiles first, or run npm run seed to build the base set.';
  end if;

  raise notice 'Posting as % existing profile(s).', available;
end $$;

-- Which of them own a company, so a posting can carry the company's name and
-- logo. A left join, because most people do not own one and that is fine.
create temporary table poster_company on commit drop as
select distinct on (c.owner_id) c.owner_id, c.id as company_id
from public.companies c
where c.owner_id is not null
order by c.owner_id, c.created_at desc;

-- ---------------------------------------------------------------------------
-- 2. The fifty postings
-- ---------------------------------------------------------------------------
--
-- Salary figures are monthly ETB unless the period says otherwise, and are
-- pitched at what these roles actually pay in Ethiopia in 2026 — a mid-level
-- architect at 32–45k, a mason's day rate at 700–950, a kitchen fit-out
-- quoted for the job rather than the month. A board full of round numbers is
-- the tell that nobody real wrote them.
--
-- `age_hours` backdates the posting. Spread unevenly on purpose: real boards
-- are lumpy, with three postings on a Tuesday and nothing on a Sunday.

create temporary table posting (
  seq integer,
  title text,
  category text,
  profession text,
  description text,
  responsibilities text,
  requirements text,
  skills text[],
  job_type public.job_type,
  work_mode public.work_mode,
  experience_level public.experience_level,
  salary_min numeric,
  salary_max numeric,
  salary_period text,
  salary_visible boolean,
  city text,
  openings integer,
  applications integer,
  status public.job_status,
  age_hours integer
) on commit drop;

insert into posting values

-- --- Architecture ----------------------------------------------------------
(1, 'Project Architect — G+8 mixed use, Bole', 'architecture', 'Architect',
 'We are taking a mixed-use building on Cameroon Street from approved concept through to working drawings and site support. You would own the drawing set: plans, sections, details, and the coordination with structures and MEP. The client is present and decisive, which makes this a good project to run.',
 'Develop the design from approved concept to construction documents. Coordinate with the structural and MEP consultants. Attend fortnightly site meetings once construction starts. Review shop drawings and answer site queries.',
 'B.Arch with at least five years in practice, three of them producing working drawings. Fluent AutoCAD, Revit an advantage. Portfolio of built work required.',
 array['AutoCAD','Revit','Working drawings','Detailing','EBCS'],
 'full_time','on_site','senior', 42000, 58000, 'month', true, 'Addis Ababa', 1, 14, 'open', 31),

(2, 'Architect — residential villas, Adama', 'architecture', 'Architect',
 'Three villa plots in the new expansion area east of Adama, each about 320 m2 on two floors. The owners want individual houses rather than one design repeated, so this is design work, not copying. Drawings go for permit in April.',
 'Concept and permit drawings for three houses. Client presentations. Coordination with the municipality on setbacks and permit requirements.',
 'B.Arch and three years of residential work. Comfortable presenting to a private client without a senior in the room.',
 array['AutoCAD','SketchUp','Residential','Permit drawings'],
 'contract','hybrid','mid', 28000, 38000, 'month', true, 'Adama', 1, 9, 'open', 76),

(3, 'Junior Architect — hospitality, Hawassa', 'architecture', 'Architect',
 'A 40-key lodge on the lake road. You would work under our project architect on layouts, details and the drawing set, and spend one week a month on site. It is a good first serious project for somebody two years out.',
 'Draw up details under supervision. Maintain the drawing register. Photograph and report on site progress monthly.',
 'B.Arch, one to three years. AutoCAD fluency is essential; the rest can be learned here.',
 array['AutoCAD','SketchUp','Hospitality'],
 'full_time','on_site','junior', 16000, 22000, 'month', true, 'Hawassa', 1, 22, 'open', 118),

(4, 'Architect for a school masterplan, Bahir Dar', 'architecture', 'Architect',
 'A private school is adding a secondary block, a library and a covered assembly area to an existing compound. The masterplan matters more than any single building — phasing, circulation at break time, and where construction can happen without closing the school.',
 'Masterplan and phasing study. Concept design for three buildings. Cost bracket per phase with the quantity surveyor.',
 'Five years or more, with at least one institutional project. Experience phasing work around a live site is what we are really looking for.',
 array['Masterplanning','AutoCAD','Phasing','Institutional'],
 'contract','hybrid','senior', 180000, 260000, 'project', true, 'Bahir Dar', 1, 6, 'open', 52),

-- --- Interior design -------------------------------------------------------
(5, 'Interior Designer — apartment fit-outs, Addis', 'interior_design', 'Interior Designer',
 'We hand over eighteen apartments a year in Lebu and Ayat and the interiors are currently whatever the buyer arranges. We want three specified packages — standard, warm, dark — that a buyer chooses from and we deliver consistently.',
 'Develop three interior packages with finish schedules and a fixed material list. Produce the buyer-facing boards. Support procurement on substitutions.',
 'Four years of residential interiors. You must be able to specify from what is actually available in Merkato and Kality, not from a European catalogue.',
 array['Finish schedules','Material specification','SketchUp','Mood boards'],
 'full_time','hybrid','mid', 30000, 42000, 'month', true, 'Addis Ababa', 1, 31, 'open', 19),

(6, 'Interior Designer — restaurant, Dire Dawa', 'interior_design', 'Interior Designer',
 'A 90-cover restaurant in a converted warehouse near the old station. High ceilings, good light, a difficult acoustic problem, and a client who wants it to feel like Dire Dawa rather than like Addis.',
 'Full interior concept, joinery drawings, lighting layout and an acoustic strategy. Weekly site presence during fit-out.',
 'Hospitality interiors experience essential. Show us a room you designed that people actually sit in.',
 array['Hospitality','Joinery detailing','Lighting design','Acoustics'],
 'contract','on_site','senior', 220000, 320000, 'project', true, 'Dire Dawa', 1, 11, 'open', 64),

(7, 'Interior stylist for handover photography', 'interior_design', 'Stylist',
 'Six completed apartments need styling for photography over four days. Furniture and props are hired and delivered; you decide what goes where and make each room photograph well.',
 'Style six units across four days alongside the photographer. Return list and condition check on hired items.',
 'Previous styling or set work. This is a short, well-defined job for somebody who works fast.',
 array['Styling','Photography support','Furniture layout'],
 'freelance','on_site','mid', 24000, 32000, 'project', true, 'Addis Ababa', 2, 27, 'open', 8),

-- --- Structural ------------------------------------------------------------
(8, 'Structural Engineer — G+12 residential, Kazanchis', 'structural_engineering', 'Structural Engineer',
 'Frame design and review for a twelve-storey residential building with two basement levels. The architectural design is fixed and the geotechnical report is in hand. We need somebody who will stamp the drawings and stand behind them.',
 'Design and detail the frame and the raft. Review and sign the drawing set. Attend the pour of each of the first three floors.',
 'Registered structural engineer with high-rise experience in Ethiopia. ETABS and a working command of ES EN 1992 are assumed.',
 array['ETABS','Rebar detailing','ES EN 1992','Raft foundations','High rise'],
 'full_time','on_site','senior', 62000, 88000, 'month', true, 'Addis Ababa', 1, 8, 'open', 42),

(9, 'Structural design review — warehouse, Mekelle', 'structural_engineering', 'Structural Engineer',
 'A 3,200 m2 steel-portal warehouse has been designed by others and we want an independent check before we buy steel. Two weeks of work, clear scope, and we pay for the review whatever it concludes.',
 'Independent check of frame, connections and foundations. Written report with any changes required, priced by the fabricator.',
 'Steel design experience and a licence to sign the review. Availability inside the next three weeks matters more than anything else.',
 array['Steel design','Portal frames','Connection design','Peer review'],
 'freelance','remote','senior', 45000, 65000, 'project', true, 'Mekelle', 1, 4, 'open', 26),

(10, 'Graduate Structural Engineer', 'structural_engineering', 'Structural Engineer',
 'We take one graduate a year and train them properly. Your first eighteen months would be detailing under a senior, with real responsibility from about month six. Pay rises when you are worth more, not on a schedule.',
 'Detailing and take-off under supervision. Site attendance one day a week. Progressive responsibility on smaller structures.',
 'BSc Civil or Structural, graduated within the last two years. Genuine interest in how buildings stand up.',
 array['ETABS','AutoCAD','Rebar detailing'],
 'full_time','on_site','entry', 12000, 17000, 'month', true, 'Addis Ababa', 2, 63, 'open', 96),

-- --- Civil / site ----------------------------------------------------------
(11, 'Site Engineer — road package, Bishoftu', 'site_engineering', 'Site Engineer',
 'Eleven kilometres of collector road with drainage and two small bridges. You would be the engineer on the ground: setting out, checking levels, signing off layers, and keeping the daily record that the client audits monthly.',
 'Setting out and level control. Daily site diary and materials records. Supervise subcontractors and report weekly to the resident engineer.',
 'BSc Civil and three years on roads. Total station competence is essential and will be checked at interview.',
 array['Setting out','Total station','Road drainage','Site records'],
 'full_time','on_site','mid', 26000, 36000, 'month', true, 'Bishoftu', 2, 19, 'open', 35),

(12, 'Resident Engineer — condominium blocks, Addis', 'civil_engineering', 'Resident Engineer',
 'Four blocks under construction in Yeka, currently at third floor. The previous resident engineer has moved abroad and we need continuity quickly. Full authority on site, reporting directly to the client.',
 'Represent the client on site. Approve materials and works. Certify monthly valuations. Chair the weekly site meeting.',
 'Ten years or more, with condominium or similar repetitive residential work. You will be asked for two references from clients, not employers.',
 array['Contract administration','Valuations','Quality control','FIDIC'],
 'full_time','on_site','lead', 70000, 95000, 'month', true, 'Addis Ababa', 1, 7, 'open', 12),

(13, 'Construction supervisor — villa, Jimma', 'construction_management', 'Site Supervisor',
 'A single private villa, 420 m2, currently at foundation. The owner lives abroad and needs somebody trustworthy running the day to day, with photographs and a written report every Friday.',
 'Daily supervision of trades. Materials ordering against the schedule. Weekly written and photographic report to the owner.',
 'Diploma or degree, five years supervising residential work. Honesty with money is the whole job; references will be checked carefully.',
 array['Site supervision','Materials control','Reporting','Residential'],
 'contract','on_site','mid', 22000, 30000, 'month', true, 'Jimma', 1, 16, 'open', 88),

(14, 'Foreman — finishing phase, Hawassa', 'construction_management', 'Foreman',
 'Two apartment blocks entering finishing. Plaster is done; from here it is screed, tiling, joinery, painting and snagging, with four trades on site at once and a handover date that will not move.',
 'Sequence and supervise the finishing trades. Hold the programme. Run the snag list to zero before handover.',
 'Eight years finishing, at least two as a foreman. You must be able to tell four gang leaders something they do not want to hear.',
 array['Finishing','Programme','Snagging','Trade coordination'],
 'full_time','on_site','senior', 24000, 33000, 'month', true, 'Hawassa', 1, 12, 'open', 47),

(15, 'Setting-out technician', 'surveying', 'Surveyor',
 'Short engagement, about six weeks, setting out a compound wall and internal roads for an industrial plot in Dukem. Instrument provided.',
 'Set out boundaries, roads and drainage runs. Produce as-built points at completion.',
 'Total station and levelling competence. Bring your own tripod if you have one.',
 array['Total station','Levelling','Setting out','As-built'],
 'contract','on_site','mid', 900, 1300, 'day', true, 'Bishoftu', 1, 15, 'open', 71),

-- --- MEP -------------------------------------------------------------------
(16, 'MEP Coordinator — hospital extension', 'mep', 'MEP Engineer',
 'A four-storey extension to a private hospital with medical gases, a substantial HVAC load and standby power. Coordination is most of the job: the ceiling void is 600 mm and everything wants to be in it.',
 'Coordinate mechanical, electrical and plumbing services in a tight ceiling void. Clash detection. Review contractor drawings before installation.',
 'Six years of MEP coordination with at least one healthcare project. Navisworks or equivalent clash workflow.',
 array['MEP coordination','Navisworks','Clash detection','Medical gas','HVAC'],
 'full_time','on_site','senior', 48000, 68000, 'month', true, 'Addis Ababa', 1, 6, 'open', 22),

(17, 'Electrical Engineer — factory power, Adama', 'electrical', 'Electrical Engineer',
 'A textile plant is adding a second production hall and needs the power design: LV distribution from the existing substation, lighting, and a diesel standby set sized for the looms.',
 'Load schedule and LV distribution design. Lighting layout to production standards. Standby generator sizing and changeover design.',
 'BSc Electrical with industrial experience. Somebody who has actually commissioned a changeover panel, not only drawn one.',
 array['LV distribution','Load calculation','Standby power','Industrial lighting'],
 'full_time','on_site','senior', 40000, 55000, 'month', true, 'Adama', 1, 10, 'open', 58),

(18, 'Electricians — apartment first fix, Addis', 'electrical', 'Electrician',
 'First fix across sixteen apartments in Summit. Conduit, back boxes and cable pulling, working to the drawings with an engineer on site twice a week. Work is measured and paid per unit.',
 'Conduit and back boxes to the drawing. Cable pulling and identification. Hand over each unit for inspection before board-out.',
 'Certified electrician with apartment experience. Own hand tools. Team leaders welcome to apply with a gang.',
 array['First fix','Conduit','Cable pulling','Residential'],
 'contract','on_site','mid', 750, 1100, 'day', true, 'Addis Ababa', 6, 41, 'open', 15),

(19, 'Plumbing Engineer — hotel, Bahir Dar', 'plumbing', 'Plumbing Engineer',
 'A 60-room hotel on the lakeshore. Cold and hot water, drainage, a booster set and solar preheat. The site has poor mains pressure, which is the interesting part of the problem.',
 'Full water and drainage design. Booster and storage sizing. Solar preheat integration with the existing boiler.',
 'Five years of hotel or institutional plumbing. Solar thermal experience is a real advantage here.',
 array['Water supply design','Drainage','Booster sets','Solar thermal'],
 'contract','hybrid','senior', 160000, 240000, 'project', true, 'Bahir Dar', 1, 5, 'open', 39),

(20, 'Plumbers — second fix and pressure checks', 'plumbing', 'Plumber',
 'Second fix and pressure checks across two blocks in Gerji. Sanitaryware is on site. Work is per apartment with a retention released once the pressure check passes.',
 'Install sanitaryware and connect. Pressure check each unit and record the result. Rectify any failure before handover.',
 'Time-served plumber. PPR welding competence required. Your own pressure pump is an advantage.',
 array['Second fix','PPR welding','Pressure checks','Sanitaryware'],
 'contract','on_site','mid', 700, 1000, 'day', true, 'Addis Ababa', 4, 33, 'open', 29),

(21, 'HVAC Technician — commissioning support', 'hvac', 'HVAC Technician',
 'A commercial building in Bole is commissioning VRF systems across eight floors. We need two technicians for six weeks alongside the supplier''s engineer.',
 'Assist with pressure checks, vacuum and charging. Record commissioning data per unit. Snag and rectify under supervision.',
 'VRF or split system experience. Refrigerant handling competence. Head for heights, since a good deal of this is on the roof.',
 array['VRF','Commissioning','Refrigerant handling','Pipework'],
 'contract','on_site','mid', 850, 1200, 'day', true, 'Addis Ababa', 2, 18, 'open', 54),

-- --- Quantity surveying / BOQ ---------------------------------------------
(22, 'Quantity Surveyor — road package, Adama', 'quantity_surveying', 'Quantity Surveyor',
 'Preparing and then administering the BOQ for a road and drainage package worth about 180 million birr. You would produce the bills, then stay on to value the work monthly once it starts.',
 'Take-off and BOQ preparation. Tender evaluation support. Monthly valuations and variation assessment once on site.',
 'Six years or more with roads. Fluency with the standard method of measurement is assumed, not asked about.',
 array['BOQ','Take-off','Valuations','Variations','Roads'],
 'full_time','hybrid','senior', 45000, 62000, 'month', true, 'Adama', 1, 13, 'open', 33),

(23, 'BOQ preparation — six villas', 'quantity_surveying', 'Quantity Surveyor',
 'Six villa designs are complete and need bills of quantities before we go to tender. Drawings are complete and coordinated. Three weeks of work for somebody who is quick and careful.',
 'Full take-off and BOQ for six house types. Rate build-ups for the preliminaries.',
 'Proven residential take-off experience. Provide a redacted example bill with your application.',
 array['BOQ','Take-off','Rate build-up','Residential'],
 'freelance','remote','mid', 55000, 80000, 'project', true, 'Addis Ababa', 1, 24, 'open', 6),

(24, 'Cost Controller — contractor side', 'quantity_surveying', 'Cost Controller',
 'A general contractor with four live sites needs one person holding the cost picture: committed spend, forecast to completion, and where each site is losing money before it has finished losing it.',
 'Maintain cost reports across four sites. Reconcile subcontractor accounts. Monthly forecast to completion for the board.',
 'QS background with a contractor rather than a consultant. Strong Excel; we will ask you to build something in the interview.',
 array['Cost reporting','Forecasting','Subcontract accounts','Excel'],
 'full_time','hybrid','senior', 42000, 58000, 'month', false, 'Addis Ababa', 1, 9, 'open', 68),

-- --- BIM / CAD / visualisation --------------------------------------------
(25, 'BIM Coordinator — Revit, commercial', 'bim', 'BIM Coordinator',
 'We are moving from CAD to Revit across the practice and the first fully modelled project is a commercial building in Lideta. You would set the standards, build the templates, and drag the rest of us along.',
 'Own the model and the standards. Set up templates and families. Run coordination between architecture, structure and MEP.',
 'Four years in Revit with at least one project modelled end to end. Ability to teach patiently matters as much as the software.',
 array['Revit','BIM 360','Families','Model coordination','IFC'],
 'full_time','hybrid','senior', 45000, 65000, 'month', true, 'Addis Ababa', 1, 17, 'open', 24),

(26, 'Revit Modeller — as-built from survey', 'bim', 'Revit Modeller',
 'A 1970s office building has been point-cloud surveyed and needs a working as-built model before refurbishment design starts. About seven weeks.',
 'Model the existing building from the point cloud to LOD 300. Flag discrepancies between survey and the archive drawings.',
 'Revit fluency and previous point-cloud work. Recap or similar.',
 array['Revit','Point cloud','Recap','As-built','LOD 300'],
 'contract','remote','mid', 90000, 130000, 'project', true, 'Addis Ababa', 1, 21, 'open', 44),

(27, 'AutoCAD Draughtsman', 'drafting_cad', 'Draughtsman',
 'Steady drawing work for a busy consultancy: permit sets, revisions, and turning red-pen markups into clean drawings. Not glamorous, done well it is indispensable.',
 'Produce and revise drawing sets to the office standard. Maintain the drawing register and issue sheets.',
 'Two years of AutoCAD in a construction office. Speed and accuracy; layer discipline will be checked.',
 array['AutoCAD','Layer standards','Drawing management','Permit sets'],
 'full_time','on_site','junior', 13000, 19000, 'month', true, 'Addis Ababa', 2, 48, 'open', 82),

(28, '3D Visualiser — residential marketing', 'rendering', '3D Visualiser',
 'Twelve exterior and eight interior stills for an apartment launch, plus one short flythrough. Models exist in SketchUp; you take them to final images.',
 'Produce twelve exteriors and eight interiors at print resolution. One 40-second flythrough. Two revision rounds included.',
 'Show a portfolio, not a CV. We care what your images look like and nothing else.',
 array['3ds Max','Corona','V-Ray','Post production','Lumion'],
 'freelance','remote','senior', 85000, 140000, 'project', true, 'Addis Ababa', 1, 29, 'open', 11),

(29, 'Junior 3D Renderer — interiors', 'visualization_3d', '3D Artist',
 'Interior stills for a joinery workshop that wants to show clients their kitchens before building them. Two or three kitchens a week, consistent style, quick turnaround.',
 'Model from the workshop''s drawings and produce two to four interior stills per kitchen.',
 'One year or more. Lumion or Enscape is fine; consistency and speed matter more than the renderer.',
 array['Lumion','Enscape','SketchUp','Interior rendering'],
 'part_time','remote','junior', 11000, 16000, 'month', true, 'Addis Ababa', 1, 37, 'open', 59),

-- --- Furniture and cabinetry ----------------------------------------------
(30, 'Kitchen fit-out — supply and install', 'furniture', 'Kitchen Fitter',
 'A private house in Old Airport needs a full kitchen: about 6.2 linear metres of base units, wall units, a tall housing and an island. Melamine carcasses, MDF sprayed fronts, quartz worktop supplied by others.',
 'Manufacture and install to the drawings supplied. Coordinate with the worktop supplier for templating. Two-year workmanship warranty.',
 'An established workshop with photographs of at least three completed kitchens. Provide references we can telephone.',
 array['Kitchen fitting','Melamine','Spray finishing','Installation'],
 'contract','on_site','senior', 280000, 420000, 'project', true, 'Addis Ababa', 1, 8, 'open', 17),

(31, 'Cabinet Maker — workshop, Gelan', 'carpentry', 'Cabinet Maker',
 'Bench work in a well-equipped shop: panel saw, edgebander, spray booth. Mostly wardrobes and kitchens for the Addis market. Steady work, paid monthly, not per job.',
 'Cut, edge, assemble and finish casework to the cutting list. Keep the machines maintained and the shop tidy.',
 'Five years on melamine and MDF casework. Panel saw and edgebander competence. Read a cutting list without help.',
 array['Panel saw','Edgebander','Casework','Melamine','Assembly'],
 'full_time','on_site','mid', 15000, 22000, 'month', true, 'Addis Ababa', 3, 26, 'open', 50),

(32, 'Wardrobe installation team', 'furniture', 'Installer',
 'Fitted wardrobes for twenty-two apartments, installed unit by unit as each is handed over. Work runs over about four months at a steady pace.',
 'Install fitted wardrobes to the drawings. Scribe to walls. Adjust doors and hand over each unit snag-free.',
 'A team of two or three with your own tools and transport. Previous fitted-furniture installation essential.',
 array['Fitted furniture','Scribing','Door adjustment','Installation'],
 'contract','on_site','mid', 6500, 9000, 'week', true, 'Addis Ababa', 2, 14, 'open', 73),

(33, 'Furniture Designer — hotel bedrooms', 'furniture', 'Furniture Designer',
 'Loose and fitted furniture for 60 hotel bedrooms in Bahir Dar: headboard wall, desk, wardrobe, luggage bench. It has to survive a hotel and be manufacturable in Ethiopia.',
 'Design the bedroom set and produce manufacturing drawings. Prototype review with the workshop. Value engineer against the budget.',
 'Furniture design with manufacturing drawings, not styling alone. Show something that was actually built from your drawings.',
 array['Furniture design','Manufacturing drawings','Prototyping','Hospitality'],
 'contract','hybrid','senior', 150000, 220000, 'project', true, 'Bahir Dar', 1, 12, 'open', 90),

-- --- Trades: masonry, finishing, painting, tiling -------------------------
(34, 'Masons — HCB and stone, Mekelle', 'masonry', 'Mason',
 'Boundary wall and external stone facing for a compound outside Mekelle. About 340 linear metres of wall, then stone facing on the entrance section.',
 'HCB walling to line and level. Stone facing to the entrance elevation. Keep the pointing consistent.',
 'Time-served masons. Stone facing experience for at least two of the team.',
 array['HCB','Stone facing','Pointing','Boundary walls'],
 'contract','on_site','mid', 700, 950, 'day', true, 'Mekelle', 5, 20, 'open', 61),

(35, 'Plasterers — internal, two blocks', 'finishing', 'Plasterer',
 'Internal plaster across two apartment blocks in Kality, roughly 9,400 m2. Materials on site, scaffold provided, measured and paid monthly.',
 'Internal plaster to the specified thickness and finish. Make good after other trades where required.',
 'Gangs of four or more preferred. Show us a wall you finished; we will look at it in raking light.',
 array['Plastering','Rendering','Making good'],
 'contract','on_site','mid', 650, 900, 'day', true, 'Addis Ababa', 8, 25, 'open', 37),

(36, 'Painting contractor — apartment blocks', 'painting', 'Painter',
 'Internal and external decoration of two completed blocks, 48 units in total. Paint is specified and will be supplied; you provide labour, access equipment and protection.',
 'Prepare, prime and finish internally and externally. Protect finished floors and joinery. Snag and touch up before handover.',
 'A contractor with a crew, not an individual. Public liability cover and three references from completed blocks.',
 array['Decoration','Surface preparation','Spray painting','External coatings'],
 'contract','on_site','senior', 950000, 1400000, 'project', true, 'Addis Ababa', 1, 11, 'open', 45),

(37, 'Tilers — large format porcelain', 'tiling', 'Tiler',
 'Large-format porcelain, 1200 × 600, to floors and bathroom walls across sixteen apartments. Substrates are prepared and levelled.',
 'Set out and lay large-format porcelain to floors and walls. Cut and fit around sanitaryware. Grout and silicone.',
 'Large-format experience specifically — the 1200 sheets are unforgiving and we have had to pull work up before.',
 array['Porcelain','Large format','Levelling systems','Grouting'],
 'contract','on_site','senior', 800, 1150, 'day', true, 'Addis Ababa', 4, 23, 'open', 20),

(38, 'Terrazzo and screed team, Dire Dawa', 'finishing', 'Screeder',
 'In-situ terrazzo to a school corridor and stair, about 900 m2, plus levelling screed to classrooms. Traditional work, done properly.',
 'Lay levelling screed to falls. In-situ terrazzo with brass dividers, ground and polished.',
 'Genuine in-situ terrazzo experience. This is a shrinking skill and we will pay for it.',
 array['Terrazzo','Screed','Grinding','Polishing'],
 'contract','on_site','senior', 900, 1300, 'day', true, 'Dire Dawa', 3, 7, 'open', 79),

(39, 'Aluminium and glazing installers', 'subcontractor', 'Glazier',
 'Windows and curtain wall sections for a commercial building in Bole. Profiles are ordered; installation runs over about ten weeks.',
 'Install aluminium windows and curtain wall to line and level. Weather seal and check for leaks.',
 'Curtain wall installation experience and a head for heights. Working at height certification preferred.',
 array['Aluminium','Curtain wall','Glazing','Weather sealing'],
 'contract','on_site','mid', 850, 1200, 'day', true, 'Addis Ababa', 4, 16, 'open', 56),

(40, 'Steel Fabricator — staircase and balustrades', 'steel_fabrication', 'Fabricator',
 'A feature staircase and glass balustrades for a private house. The design is agreed and detailed; this is fabrication and installation to a high standard of finish.',
 'Fabricate and install the stair stringers, treads and balustrade fixings. Coordinate with the glazing supplier.',
 'Architectural metalwork rather than structural steel. Welds will be visible, so show us your work.',
 array['Architectural metalwork','TIG welding','Balustrades','Stairs'],
 'contract','on_site','senior', 240000, 360000, 'project', true, 'Addis Ababa', 1, 9, 'open', 27),

-- --- Plant, labour, logistics ---------------------------------------------
(41, 'Excavator Operator — 20 tonne', 'equipment_operators', 'Plant Operator',
 'Bulk excavation and basement dig on a site in Lemi Kura, then trenching for services. Six months of continuous work with a well-maintained machine.',
 'Operate a 20-tonne tracked excavator. Daily checks and greasing. Work to setting-out pegs without damaging them.',
 'Valid operator licence and five years on tracked machines. Basement dig experience preferred.',
 array['Excavator','Bulk excavation','Trenching','Plant maintenance'],
 'full_time','on_site','mid', 18000, 26000, 'month', true, 'Addis Ababa', 1, 30, 'open', 66),

(42, 'Site labourers — general, Bishoftu', 'construction_labor', 'Labourer',
 'General site labour on an industrial build: materials movement, assisting trades, keeping the site clean and safe. Meals and transport from Bishoftu town provided.',
 'Assist the trades as directed. Move materials. Keep access routes and the site clean.',
 'Fit, reliable and punctual. No experience needed; you will be shown what to do.',
 array['General labour','Materials handling','Site safety'],
 'full_time','on_site','entry', 350, 480, 'day', true, 'Bishoftu', 10, 57, 'open', 40),

(43, 'Storekeeper — site materials', 'procurement', 'Storekeeper',
 'Materials control on a large residential site. Receiving, issuing, stock records and the monthly reconciliation that tells us what is actually going into the building.',
 'Receive and inspect deliveries. Issue against requisitions. Maintain the bin cards and reconcile stock monthly.',
 'Three years in a site store. Careful record keeping matters more than qualifications here.',
 array['Stock control','Goods receiving','Reconciliation','Bin cards'],
 'full_time','on_site','mid', 12000, 17000, 'month', true, 'Addis Ababa', 1, 34, 'open', 85),

(44, 'Procurement Officer — construction materials', 'procurement', 'Procurement Officer',
 'Buying for four live sites: cement, reinforcement, blocks, finishes and the awkward long-lead items. Real authority to negotiate, and real accountability for what you pay.',
 'Source and negotiate with suppliers. Maintain the approved supplier list. Track long-lead items against the programme.',
 'Four years buying construction materials in Ethiopia. You should already know what a tonne of rebar costs this week.',
 array['Sourcing','Negotiation','Supplier management','Logistics'],
 'full_time','hybrid','mid', 25000, 36000, 'month', false, 'Addis Ababa', 1, 28, 'open', 30),

-- --- Management ------------------------------------------------------------
(45, 'Project Manager — commercial, Addis', 'project_management', 'Project Manager',
 'A 9,000 m2 commercial building from mobilisation to handover, about twenty-six months. Programme, cost, subcontractors and the client relationship all sit with you.',
 'Own the programme and the cost report. Let and manage subcontracts. Chair the client meeting monthly.',
 'Ten years, with at least one commercial building delivered from start to handover. Primavera or MS Project to a professional standard.',
 array['Programme','Primavera','Subcontract management','Cost control'],
 'full_time','on_site','lead', 75000, 110000, 'month', false, 'Addis Ababa', 1, 10, 'open', 23),

(46, 'Contracts Administrator', 'construction_management', 'Contracts Administrator',
 'Administering three subcontract packages and the main contract on a live site: variations, claims, correspondence, and keeping the paper trail that decides who is right when it matters.',
 'Draft and administer subcontract documentation. Assess variations and claims. Maintain the contractual correspondence file.',
 'Five years in contract administration under FIDIC or the Ethiopian standard conditions. Precise written English required.',
 array['FIDIC','Variations','Claims','Contract correspondence'],
 'full_time','hybrid','senior', 38000, 52000, 'month', true, 'Addis Ababa', 1, 13, 'open', 49),

(47, 'General Contractor — school block, Gondar', 'general_contractor', 'Contractor',
 'A single-storey eight-classroom block with sanitary facilities, roughly 780 m2. Drawings and BOQ are complete. We are looking for a contractor to price and build it.',
 'Build the block to the drawings and specification within eight months. Provide all labour, plant and materials.',
 'Grade 5 or above, with school or similar institutional work completed. Bring evidence of two completed projects.',
 array['Building construction','Institutional','Grade 5','Turnkey'],
 'contract','on_site','senior', 9500000, 12500000, 'project', false, 'Gondar', 1, 5, 'open', 34),

-- --- Landscaping and property ---------------------------------------------
(48, 'Landscape designer and installer — compound', 'landscaping', 'Landscape Designer',
 'A 1,900 m2 compound around a new house in Sululta: planting, hard landscaping, irrigation and outdoor lighting. Indigenous planting strongly preferred.',
 'Design and install soft and hard landscaping. Irrigation and outdoor lighting. Maintain for the first three months.',
 'Landscape work with photographs of installed gardens a year or more after completion — anyone can photograph a garden on the day it is planted.',
 array['Planting design','Hard landscaping','Irrigation','Indigenous species'],
 'contract','on_site','mid', 320000, 480000, 'project', true, 'Addis Ababa', 1, 15, 'open', 43),

(49, 'Property Manager — residential portfolio', 'property_services', 'Property Manager',
 'Thirty-four let apartments across three buildings in Addis. Tenants, rent collection, maintenance, and the contractors who do the work. Full authority within a budget.',
 'Manage tenancies and rent collection. Instruct and supervise maintenance contractors. Monthly report to the owners.',
 'Three years managing let residential property. Firm, organised and good with people who are complaining.',
 array['Tenancy management','Rent collection','Maintenance','Reporting'],
 'full_time','hybrid','mid', 22000, 32000, 'month', true, 'Addis Ababa', 1, 26, 'open', 55),

(50, 'Building surveyor — condition reports', 'property_services', 'Building Surveyor',
 'Condition surveys on eleven commercial properties ahead of a portfolio sale. Each needs a written report with photographs, defects, and an indicative cost to put right.',
 'Survey eleven properties. Written condition report with photographs and costed defects for each.',
 'Building surveying background and the ability to write a report a lawyer will read. Six weeks of work.',
 array['Condition survey','Defect diagnosis','Report writing','Costing'],
 'freelance','on_site','senior', 130000, 180000, 'project', true, 'Addis Ababa', 1, 8, 'open', 62);

/**
 * The authored ages are a running order, not a clock.
 *
 * Stretched here across the last six weeks, because a board where every one of
 * fifty postings appeared within five days did not happen — it was loaded. A
 * real board has three things from this morning, a dozen from the past
 * fortnight, and a tail going back a month that nobody has closed yet.
 *
 * Three are pulled to today so the top of the feed is genuinely fresh.
 */
update posting set age_hours = case
  when seq = 7  then 3
  when seq = 23 then 9
  when seq = 12 then 26
  else greatest(2, round(age_hours * 7.5))
end;

-- Two roles that have already run their course, so the board is not fifty
-- identical green lights. Real boards have history on them.
update posting set status = 'filled', applications = 19, age_hours = 640 where seq = 3;
update posting set status = 'filled', applications = 11, age_hours = 720 where seq = 27;
update posting set status = 'closed', applications = 6,  age_hours = 900 where seq = 15;

-- ---------------------------------------------------------------------------
-- 3. Attribute each posting to somebody who is already here
-- ---------------------------------------------------------------------------
--
-- Round robin over the real profiles, so the postings spread evenly however
-- many there are. With forty profiles nobody posts twice; with six, each holds
-- eight or nine, which is what a small active board looks like anyway.

insert into public.jobs (
  poster_id, company_id, title, slug, description, responsibilities, requirements,
  job_type, work_mode, experience_level, profession, category, skills,
  salary_min, salary_max, currency, salary_period, salary_visible,
  location_city, location_country, openings, application_count,
  closes_on, status, visibility, created_at, updated_at
)
select
  e.id,
  pc.company_id,
  p.title,
  -- Unique per poster, which is what the constraint from 0012 requires, and
  -- stable across re-runs so a second run updates nothing and inserts nothing.
  lower(regexp_replace(p.title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || p.seq,
  p.description,
  p.responsibilities,
  p.requirements,
  p.job_type,
  p.work_mode,
  p.experience_level,
  p.profession,
  p.category,
  p.skills,
  p.salary_min,
  p.salary_max,
  'ETB',
  p.salary_period,
  p.salary_visible,
  p.city,
  'Ethiopia',
  p.openings,
  p.applications,
  -- A closing date on about half of them, far enough out to still be open.
  case when p.seq % 2 = 0
       then (now() - make_interval(hours => p.age_hours) + interval '45 days')::date
       else null end,
  p.status,
  'public',
  now() - make_interval(hours => p.age_hours),
  now() - make_interval(hours => p.age_hours)
from posting p
join eligible_poster e
  on e.seat = (p.seq - 1) % (select count(*) from eligible_poster)
left join poster_company pc on pc.owner_id = e.id
-- Never touch a posting that is already there, whoever wrote it.
where not exists (
  select 1 from public.jobs j
  where j.poster_id = e.id
    and j.slug = lower(regexp_replace(p.title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || p.seq
);

-- ---------------------------------------------------------------------------
-- 4. Register what was inserted, so it can be taken back out
-- ---------------------------------------------------------------------------

insert into public.seed_content (entity, entity_id, batch)
select 'jobs', j.id, 'jobs-launch-01'
from public.jobs j
join posting p
  on j.slug = lower(regexp_replace(p.title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || p.seq
on conflict (entity, entity_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. What happened
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.seed_content where batch = 'jobs-launch-01') as registered,
  (select count(*) from public.jobs j
     join public.seed_content s on s.entity_id = j.id and s.batch = 'jobs-launch-01'
    where j.status = 'open') as live_on_the_board,
  (select count(distinct poster_id) from public.jobs j
     join public.seed_content s on s.entity_id = j.id and s.batch = 'jobs-launch-01') as posting_as,
  (select count(distinct location_city) from public.jobs j
     join public.seed_content s on s.entity_id = j.id and s.batch = 'jobs-launch-01') as cities,
  (select count(distinct category) from public.jobs j
     join public.seed_content s on s.entity_id = j.id and s.batch = 'jobs-launch-01') as categories;

commit;

"use strict";

const sources = {
  N: "Brief, Naperville: DuPage and Will; 60540, 60563, 60564, 60565; deep more often than regular; condos, apartments and five-bedroom houses.",
  P: "Brief, Plainfield: Will and Kendall; 60544, 60585, 60586; regular mostly every two weeks, deep less often; do not claim clients start with deep.",
  A: "Brief, Aurora: 60502, 60504, 60505, 60506; regular and deep about equally; apartments and townhomes; separate Google profile. Water only on Deep.",
  B: "Brief, Bolingbrook: Will and DuPage; 60440, 60490; regular, then deep and move cleaning; no water claim.",
  D: "/services/deep-cleaning: Is Deep Cleaning Right for You; What's Included; comparison with regular; optional add-ons.",
  M: "/services/move-in-move-out-cleaning: empty-home scope by room; appliance interiors; cabinets/drawers if empty; preparation before moving and walkthrough.",
  V: "Current /naperville and /plainfield: clear surfaces, valuables and walkways; secure anxious pets; arrange access; ask about parking; deep guide 4 to 6 hours, confirmed for actual scope.",
  C: "/pricing: quote depends on size, bathrooms, condition, service and selected extras. Empty cabinet interiors are listed separately; no new prices published here.",
  R: "Existing city review component: same written excerpts and order, local clients first; omit stars-only reviews.",
};

const cities = {
  naperville: { name: "Naperville", sources: ["N"], reviewsFirst: ["Amy K.", "Erika B.", "Eric J."], zips: ["60540", "60563", "60564", "60565"] },
  aurora: { name: "Aurora", sources: ["A"], reviewsFirst: ["Judy V.", "Tyshone J."], zips: ["60502", "60504", "60505", "60506"] },
  plainfield: { name: "Plainfield", sources: ["P"], reviewsFirst: ["Mona A.", "Suganya S."], zips: ["60544", "60585", "60586"] },
  bolingbrook: { name: "Bolingbrook", sources: ["B"], reviewsFirst: ["Siddique A."], zips: ["60440", "60490"] },
};
const services = {
  "deep-cleaning": { name: "Deep Cleaning", parent: "/services/deep-cleaning", sources: ["D"] },
  "move-out-cleaning": { name: "Move-In / Move-Out Cleaning", parent: "/services/move-in-move-out-cleaning", sources: ["M"] },
};

const copy = {
  "/naperville/deep-cleaning": {
    intro: "Give a lived-in Naperville home a detailed reset, from kitchen grease to bathroom grout and the edges everyday cleaning can miss.",
    tile: "A one-time appointment for accumulated buildup, seasonal cleaning, or preparing for ongoing upkeep.",
    statement: "Tell us which room needs the closest attention, not just how many rooms there are.",
    whoTitle: "When the everyday routine is not enough",
    who: "Deep cleaning is booked here more often than regular cleaning. We serve Naperville in DuPage and Will counties, with homes ranging from condos and apartments to five-bedroom houses. This service suits a home that has gone months without professional attention, a seasonal refresh, or a reset before recurring visits. It is more detailed than routine maintenance, not a substitute for keeping up between appointments.",
    rooms: [
      ["Kitchen details", "Degrease the stovetop and range hood exterior; disinfect counters and backsplash; clean the microwave interior, appliance exteriors, sink and faucet; wipe cupboard fronts and handles."],
      ["Bathroom buildup", "Scrub toilets inside, outside and behind; clean tubs, showers, tile and grout; polish mirrors and glass; wipe cabinet fronts and scrub floor corners."],
      ["Living spaces and bedrooms", "Dust reachable furniture, shelves, fans and vents; hand-wipe baseboards and door frames; clean switches, doors, interior door glass, window sills and tracks; vacuum rugs and accessible under-bed areas; mop hard floors. Trash is removed."],
    ],
    scope: "Inside the oven, refrigerator and empty cabinets are optional requests rather than part of the kitchen exterior work above. Select those tasks when pricing the visit. Interior window washing is also different from cleaning sills and tracks. A clear list keeps the appointment focused on the work you actually want.",
    preparationTitle: "Leave the cleaning, prepare the access",
    preparation: "You do not need to wash the sinks or floors before we arrive. Clear counters and walking space, put fragile items and private paperwork away, and secure pets that are anxious around vacuums. Before the first visit, we ask where cleaners can park. You can be out if entry instructions are arranged. Allow roughly 4 to 6 hours as a guide, not a guaranteed finish time; we confirm the estimate for your home's condition and selected tasks.",
    pricing: "Use the pricing page for the current options, then request a quote with your bedroom count, bathrooms, floor area and extras. The estimate should describe this particular property rather than an average house. Check the agreed scope before the appointment.",
    faq: [
      ["Which Naperville ZIP codes can I request?", "Enter 60540, 60563, 60564 or 60565, then provide the address of the home to be cleaned."],
      ["Can I book this for an apartment?", "Yes. This service is available for apartments and condos as well as houses; describe the actual rooms in your quote."],
      ["Does detailed kitchen cleaning include the oven interior?", "Oven interiors are an optional extra for this service. Choose that work in the quote rather than assuming it comes with exterior appliance cleaning."],
      ["Must I start a recurring plan afterward?", "No. Book this as a one-time reset, or discuss recurring upkeep separately if you want ongoing help."],
    ],
  },
  "/aurora/deep-cleaning": {
    intro: "A closer clean for an Aurora apartment, townhome or house when routine dusting and floor care leave too much behind.",
    tile: "Choose detailed work for grease, grout and reachable surfaces after a long gap between professional visits.",
    statement: "Describe the buildup you can see so the booked work matches your priorities.",
    whoTitle: "Choose by the work, not the label",
    who: "Regular and deep cleaning are booked about equally in Aurora. Apartments and townhomes are common among the homes we clean here. Pick this appointment when kitchen deposits, bathroom tile or neglected edges need a fuller clean than the maintenance routine. It also suits a seasonal refresh or preparation for recurring service. A furnished home does not have to be empty for this kind of reset.",
    rooms: [
      ["Cooking and food areas", "We clean the microwave inside, wipe appliance fronts and cupboard handles, degrease the cooking surface and hood exterior, and scrub the sink. Counters, backsplash and floor edges receive detailed attention."],
      ["Showers, toilets and mirrors", "The checklist covers toilet disinfection, tub and shower cleaning, grout and tile scrubbing, polished mirrors, bathroom cabinet fronts and floor corners behind the toilet."],
      ["Dust, doors and floors", "Furniture, decor and reachable shelves are dusted. Baseboards and door frames are hand-wiped; fans, vents, switches, sills, tracks and interior door glass are cleaned. Rugs, accessible closet floors, under-bed areas and hard flooring are vacuumed or mopped. Trash is removed."],
    ],
    scope: "Aurora's water comes from the Fox River plus wells and is lime-softened, about 6 to 10 grains per gallon. We pay extra attention to faucets, fixtures and shower glass. For separate interior appliance or cabinet work, use the extra-service selections. Window glass washing should likewise be requested separately from sill and track cleaning.",
    preparationTitle: "Make room for the detailed tasks",
    preparation: "Move loose belongings off the surfaces you want cleaned and keep routes between rooms clear. Set valuables aside and keep nervous pets away from the activity. We ask about parking before the initial appointment. Being home is not required when access has been agreed. A deep visit has a guide range of 4 to 6 hours; room size, condition and additional work affect the estimate we confirm before arrival.",
    pricing: "Compare service options on our pricing page. Add your own house details to the quote form, including any refrigerator, oven or empty-cabinet interiors. Confirming those choices first separates the main room checklist from optional work without relying on a city-specific price list.",
    faq: [
      ["Where in Aurora is this service available?", "Our listed ZIP codes are 60502, 60504, 60505 and 60506. Use the home's address when requesting the appointment."],
      ["Is a townhome suitable for this appointment?", "Yes. Townhomes and apartments are among the properties we clean here. The quote uses your property's room and bathroom details."],
      ["What makes this different from regular maintenance?", "It adds detailed work such as kitchen degreasing, hand-wiped baseboards, and bathroom tile and grout cleaning to the routine surface work."],
      ["How soon can I book an Aurora visit?", "We check the schedule and confirm the soonest date. Do not treat the quote form as a promise of immediate availability."],
    ],
  },
  "/plainfield/deep-cleaning": {
    intro: "Book a focused reset for a Plainfield home that needs more attention to cooking grease, bathroom surfaces and dust along the edges.",
    tile: "Detailed cleaning is an option for the condition of your home, not a required first step for every client.",
    statement: "Describe the rooms as they are today, including any work outside the standard checklist.",
    whoTitle: "Extra attention when your home needs it",
    who: "Most of our Plainfield clients choose regular cleaning, mainly every two weeks; deep cleaning is booked less often. In Will and Kendall counties, this more detailed appointment is available for a home that has fallen behind, a seasonal refresh or a first professional visit after months without one. Choose it for the work involved. We do not assume that everyone beginning an ongoing schedule needs this service first.",
    rooms: [
      ["Kitchen surfaces and grease", "Stovetops and the outside of range hoods are degreased. Counters and backsplash are disinfected, cabinet fronts wiped, appliance exteriors cleaned and the microwave washed inside. The sink and faucet are scrubbed."],
      ["Bathroom fixtures and tile", "Toilets receive attention inside, outside and behind. We scrub showers, tubs, tile and grout; clean mirrors and glass; wipe vanity fronts and handles; and wash floors into the corners."],
      ["Rooms, trim and flooring", "Detailed dusting reaches furniture, shelves, decor, ceiling fans and vents. Doors, frames, interior door glass, switches, baseboards, sills and tracks are cleaned. Carpet edges and accessible under-bed space are vacuumed; hard floors are mopped. Trash is removed."],
    ],
    scope: "Specify appliance interiors if you want them: inside ovens and refrigerators are extras on a deep visit. Empty cabinet interiors and interior window washing also need their own selections. This avoids confusing a clean cupboard front with work inside it. The service page sets out the full checklist if you want to compare tasks before choosing.",
    preparationTitle: "Before the cleaner reaches your door",
    preparation: "Leave surfaces free of loose items, clear the floor and put delicate possessions somewhere safe. Pets that dislike cleaning activity should be secured. Arrange how the cleaner will enter if you are away; we also ask where to park before the first visit. Expect an estimated 4 to 6 hours for deep work as a guide only. The agreed timing reflects the home's size, current condition and any booked extras.",
    pricing: "There is no separate Plainfield tariff to guess from. Open the pricing page, describe the property, and select the tasks you want quoted. Bathroom count and floor area help distinguish the actual job from a general description. We confirm the scope before service.",
    faq: [
      ["Which Plainfield postal codes are covered?", "We list 60544, 60585 and 60586. Include the cleaning address with your request so the property is clear."],
      ["Is this required before every two-week schedule?", "No. The choice depends on the home's condition and requested work. Regular service and a detailed reset are different options."],
      ["Can I request a one-off seasonal cleaning?", "Yes. A seasonal refresh is one use for this service; an ongoing booking is not required afterward."],
      ["Are window interiors the same as window tracks?", "No. The checklist includes sills and tracks. Request interior window washing separately when choosing additional services."],
    ],
  },
  "/bolingbrook/deep-cleaning": {
    intro: "A room-by-room Bolingbrook reset for buildup that needs more than routine maintenance of counters, bathrooms and floors.",
    tile: "Choose a fuller clean for a seasonal change, a long break in professional care or preparation for regular upkeep.",
    statement: "Point out the kitchen, bathroom or living space that matters most to you.",
    whoTitle: "A different scope from ongoing upkeep",
    who: "In Bolingbrook, regular cleaning is booked most, followed by deep cleaning and move-in/move-out service. We cover the Will and DuPage county area. This appointment is for detailed work in a lived-in home, whether cooking grease has accumulated, bathroom grout needs attention or dust has settled beyond the usual surfaces. It can stand alone. You can also discuss future maintenance without treating this booking as a recurring contract.",
    rooms: [
      ["The working kitchen", "Countertops, backsplash, sink and tap are cleaned thoroughly. The checklist includes degreasing the stovetop and hood exterior, wiping cabinet doors and pulls, cleaning appliance outsides and washing inside the microwave."],
      ["Bathroom detail", "Clean and disinfect the toilet inside and out, including behind it. Scrub baths, showers, grout and tiles; polish glass and mirrors; wipe cupboard fronts; and reach floor edges and corners."],
      ["Bedrooms and shared spaces", "Dust decor, furniture and shelves, along with reachable fans, fixtures and vents. Wipe trim, interior doors and their glass, handles, switches, sills and tracks. Vacuum carpet borders, accessible under-bed areas and closet floors before mopping hard surfaces. Trash is removed."],
    ],
    scope: "Do not confuse appliance exteriors with the insides. Oven and refrigerator interiors can be selected as additional work, as can empty cabinets and interior window washing. Put those requests into the quote rather than leaving them for the day. A room list plus the selected extras gives a clearer description than simply asking for everything.",
    preparationTitle: "Plan entry and clear the work areas",
    preparation: "Put paperwork, breakable objects and valuables away. Clear counters and walkways, then secure pets that may be unsettled by equipment or an open door. Before your first cleaning we ask where cleaners can park. You do not need to stay if entry has been arranged. Timing is confirmed against the booked work; 4 to 6 hours is a guide for deep cleaning, not a fixed finish time for every home.",
    pricing: "Use our pricing page for the same options available across the site. Your quote uses the service, number of bedrooms and bathrooms, square footage, condition and requested extras. No new local price is set on this page. Review the scope with us before the visit.",
    faq: [
      ["What Bolingbrook ZIP codes do you list?", "The service area includes 60440 and 60490. Tell us the address of the home when you request a quote."],
      ["Is this suitable after months without professional cleaning?", "Yes. A home that needs a detailed catch-up is one reason to choose this appointment instead of routine maintenance."],
      ["What work is done along floors and trim?", "Hand-wiped baseboards and door frames, carpet-edge vacuuming and detailed hard-floor cleaning are on the deep-cleaning checklist."],
      ["Can the fridge be cleaned inside as well?", "Yes, request it as an extra for this service. Cleaning the outside of appliances does not automatically select their interiors."],
    ],
  },
  "/naperville/move-out-cleaning": {
    intro: "Arrange an empty-home clean in Naperville between removing the last belongings and handing over the property, or before bringing furniture into a new home.",
    tile: "Plan around the move itself so cupboards, closets and floor space can be reached.",
    statement: "Tell us whether you are moving in or moving out and describe any handoff requirements.",
    whoTitle: "An appointment between households",
    who: "This one-time service is for tenants finishing a lease, owners changing homes, and landlords or property managers arranging a turnover. Naperville properties range from condos and apartments to five-bedroom houses across DuPage and Will counties. Book for an empty property, not around packed cupboards or rooms full of boxes. Cleaning after belongings leave makes the listed interior work accessible before the final walkthrough.",
    rooms: [
      ["An empty kitchen", "Inside the oven and refrigerator are cleaned. Countertops and backsplash are disinfected, the stovetop degreased, and appliance fronts and cabinet handles wiped. The sink and faucet are scrubbed; request cabinet and drawer interiors when empty."],
      ["Bathrooms for the next occupant", "Disinfect toilets, sinks, baths and showers. Scrub tiles and grout, polish fixtures, clean mirrors and glass, and wash floors. Empty vanity interiors can be wiped; exhaust fans are part of the room checklist."],
      ["Floors, closets and other rooms", "Wipe closet shelves and rods, interior doors, switches and handles. Dust light fixtures and fans, clean vents, sills, tracks and interior glass, hand-wipe baseboards, then vacuum and mop accessible floors. Trash is removed."],
    ],
    scope: "Discuss empty cabinets and drawers explicitly. The move-service checklist lists that work when empty, while the calculator offers inside cabinets as a separate selection. Confirm the request in your quote instead of assuming it is free. Share any landlord or property-manager requirements before booking so they can be compared with the stated service scope.",
    preparationTitle: "Put the visit on the right side of moving day",
    preparation: "For departure, remove belongings first and arrange cleaning before the walkthrough. For arrival, the service guide suggests one or two days before moving in. Clear loose items and leave access instructions if you cannot be there. We ask where cleaners can park before the first appointment. The move guide allows about 3 to 5 hours for an average home; actual timing is confirmed for size, condition and selected work, not promised from that range.",
    pricing: "Check the pricing page for current move-cleaning options and any additional selections. The quote form is for the property being handed over, so use its bathroom count, bedrooms and floor area. An inspection requirement should be described, not assumed to be included.",
    faq: [
      ["Which Naperville addresses can I request?", "We list ZIP codes 60540, 60563, 60564 and 60565. Enter the property that needs cleaning, even if you have already moved elsewhere."],
      ["Should the house be empty for this booking?", "Yes. Arrange for belongings to be removed so floors, closets and the requested empty storage interiors are accessible."],
      ["Does the move checklist cover oven and fridge interiors?", "Yes. Both are listed on the move-service kitchen checklist, unlike the optional interior appliance work on a deep-cleaning visit."],
      ["Does a cleaning promise my deposit back?", "No deposit outcome is promised here. Give us the landlord's requirements and compare them with the booked checklist before the visit."],
    ],
  },
  "/aurora/move-out-cleaning": {
    intro: "Prepare an empty Aurora property for its next occupant, with kitchen interiors, bathroom detail and accessible floors on the moving checklist.",
    tile: "A handoff appointment is about the space left behind, not routine cleaning around household belongings.",
    statement: "Use the address being cleaned, especially if your move takes you to a different home.",
    whoTitle: "For the gap before keys change hands",
    who: "Apartments and townhomes are common among our Aurora clients. Move-in/move-out cleaning is booked less often than regular or deep work, but serves a different purpose: an empty-home handoff. Renters, new homeowners and property managers can request it after a household leaves or before the next one arrives. Tell us about lease or inspection requirements before choosing the scope, rather than expecting routine maintenance to cover the turnover.",
    rooms: [
      ["Kitchen interiors and surfaces", "The refrigerator interior and oven are cleaned, followed by appliance exteriors, stovetop grease, counters and backsplash. Scrub the sink and tap, wipe cupboard fronts and pulls, and specify empty drawers and cabinets for interior work."],
      ["Washrooms and vanities", "Toilets, sinks, showers and tubs are disinfected. Tile and grout are scrubbed, fixtures polished, mirrors cleaned and floors washed. Wiping empty cabinet interiors and cleaning exhaust fans are listed in the moving scope."],
      ["Rooms after furniture leaves", "Closets are dusted and vacuumed; their shelves and rods are wiped. Clean interior glass, sills and tracks, doors and switches, fans and light fittings, vents and baseboards. All accessible floor surfaces receive vacuuming or mopping. Trash is removed."],
    ],
    scope: "An empty cupboard is a condition for cleaning its interior, not a reason to guess its price. Our service checklist describes the task, and the calculator lists cabinet interiors separately. Select and confirm that work when requesting a quote. The same advance conversation helps establish which property-manager requirements match the offered checklist and which requests need discussion.",
    preparationTitle: "Finish the packing before cleaning begins",
    preparation: "Remove belongings and leave the areas to be cleaned accessible. Arrange entry if you will be collecting keys or attending to the move elsewhere. Before a first visit, we ask about parking. An outgoing clean belongs before the final walkthrough; an incoming clean can be arranged one or two days before moving day. The move-service guide suggests roughly 3 to 5 hours for average homes, with the actual estimate confirmed for this property's size and condition.",
    pricing: "Use the current pricing options rather than an assumed apartment rate. Bedrooms, bathrooms, square footage and any extra requests describe the job. Continue to the quote form with the cleaning address and agreed tasks; the service page remains available for the complete checklist.",
    faq: [
      ["What Aurora ZIP codes are listed for moving cleans?", "60502, 60504, 60505 and 60506 are listed. Request the appointment for the address being vacated or occupied."],
      ["Can I book for a townhome handoff?", "Yes. Give the property's own room details and the scope needed for the move, rather than using details from your next address."],
      ["How do I arrange a visit if I cannot stay?", "Provide access instructions in advance. The cleaner can enter as agreed without requiring you to remain throughout the appointment."],
      ["Is the earliest date guaranteed by the form?", "No. We check the schedule and confirm the soonest date. Share your moving arrangements when discussing the booking."],
    ],
  },
  "/plainfield/move-out-cleaning": {
    intro: "Give an empty Plainfield property attention before the next household arrives, from appliance interiors to closet shelves and bathroom floors.",
    tile: "Choose an empty-home visit for moving day rather than assuming regular maintenance covers a handoff.",
    statement: "The property must be ready to reach, with packing and loose belongings out of the way.",
    whoTitle: "Cleaning for a change of address",
    who: "Our Plainfield area covers Will and Kendall counties. This service fits renters leaving a property, owners preparing to occupy one and managers between tenants. Most clients here book ongoing regular cleaning, mainly every two weeks; a moving appointment is a separate one-time job, not a compulsory first stage of that schedule. Decide from the state of the property and the work required for the handover.",
    rooms: [
      ["Kitchen at handover", "Clean the oven and refrigerator inside, degrease the hob and wash appliance exteriors. Disinfect worktops and backsplash, scrub the basin and faucet, wipe cabinet fronts and handles, and request interiors of emptied cupboards and drawers."],
      ["Bathroom finish", "Scrub grout and tiles and disinfect the toilet, shower or bath, and sink. Clean the mirror and other glass, polish fittings, wipe empty storage interiors and clean the exhaust fan. Floors receive detailed washing."],
      ["Vacated living areas", "Dust the remaining reachable surfaces, fans and fixtures. Wipe baseboards, doors, handles, switches, closet rods and shelving; clean vents, interior glass, window sills and tracks. Vacuum and mop the floors, including accessible closets. Trash is removed."],
    ],
    scope: "For cabinet interiors, first empty the storage and then confirm the task in the quote. It appears on the moving checklist subject to that condition, but the pricing calculator makes it a separate choice. If a landlord has a checklist of their own, describe those requests before the visit. Do not assume an inspection outcome from the service name.",
    preparationTitle: "Make a clear space between packing and arrival",
    preparation: "Plan an outgoing appointment after your belongings have left and before the final walkthrough. For an incoming visit, allow the one or two days before moving that our service guide recommends. Provide entry arrangements if you will be away, and keep the working areas clear. We ask about cleaner parking before the initial visit. A guide duration is 3 to 5 hours for an average home; we confirm the estimate after considering its size, condition and booked tasks.",
    pricing: "Open our pricing page to see how the property and service selections shape the quote. Use the rooms and square footage at the cleaning address. Add specific requests before booking, including empty cabinet interiors, so the agreed work is clear rather than inferred from moving day alone.",
    faq: [
      ["Where can I request this in Plainfield?", "The listed postal codes are 60544, 60585 and 60586. Supply the actual property address when asking for a quote."],
      ["Is this the same as my recurring cleaning?", "No. A moving clean has an empty-home checklist that includes work such as oven and refrigerator interiors and accessible closet shelving."],
      ["Can I book once without an ongoing schedule?", "Yes. This is a one-time service. Future maintenance can be discussed separately and is not required for the moving appointment."],
      ["What if cupboards still contain belongings?", "Their interiors must be empty for the listed interior work. Remove contents and confirm the requested tasks before the cleaner arrives."],
    ],
  },
  "/bolingbrook/move-out-cleaning": {
    intro: "Book an empty-property clean in Bolingbrook before moving into the space or after leaving it, with the handoff checklist agreed in advance.",
    tile: "An outgoing tenant, incoming owner or property manager can request a one-time turnover appointment.",
    statement: "Mention any inspection requests before service so you can compare them with the cleaning checklist.",
    whoTitle: "Choose the empty-home checklist",
    who: "We serve Bolingbrook in Will and DuPage counties. Regular cleaning is booked most here, followed by deep and move-in/move-out work. For a change of occupants, select the moving scope rather than routine upkeep around furniture. It is intended for homes with belongings removed. That lets the cleaner reach cupboards, closets and floors before an inspection or before new furniture is brought in.",
    rooms: [
      ["Appliances and kitchen storage", "Wash inside the refrigerator and oven, then clean appliance fronts and degrease the stovetop. Scrub the sink, disinfect the backsplash and counters, wipe cupboard doors and handles, and arrange empty cabinet and drawer interior cleaning."],
      ["Bathrooms between occupants", "Thorough toilet, bath, shower and sink disinfection is followed by tile and grout scrubbing. Polish fixtures and glass, clean mirrors and exhaust fans, wipe emptied vanity interiors, and scrub the floor."],
      ["Open rooms and closets", "Closet rods and shelves are wiped and closet floors vacuumed. The room checklist covers interior doors, switches and handles, fans, light fixtures, vents, window sills, tracks and interior glass, hand-wiped trim and detailed floor care. Trash is removed."],
    ],
    scope: "The cabinet task needs two checks: the interior is empty, and the work is selected in your quote. Our moving page lists the scope while the calculator presents inside cabinets separately. Confirm it in advance along with any landlord or manager instructions. A cleaning checklist explains the work; it does not promise a deposit refund or inspection result.",
    preparationTitle: "Arrange the handoff, then the visit",
    preparation: "For move-out, finish removing belongings before cleaning and leave time before the walkthrough. For move-in, our guide recommends the day or two before occupying the property. Agree on entry if you will not stay there during the work. We ask where cleaners can park before the first visit. The move guide uses about 3 to 5 hours for an average home; we confirm timing for the actual floor area, condition and requests rather than treating it as a fixed slot length.",
    pricing: "The pricing page holds the current service and extra-work options. Enter this home's room counts and floor area in the quote, not those of the property you are moving from or to. Review selected tasks before the booking so empty storage interiors and other requests are explicit.",
    faq: [
      ["Which Bolingbrook postal areas are listed?", "Request service in 60440 or 60490 and include the address that will be cleaned."],
      ["Does the kitchen checklist include the oven inside?", "Yes. Interior oven and refrigerator cleaning are part of the moving-service checklist, along with kitchen surface work."],
      ["When should the outgoing property be cleaned?", "Arrange the appointment after belongings have been removed and before the final walkthrough, as described in the service guide."],
      ["Can a property manager request this service?", "Yes. Property managers and landlords are among those the moving service is designed for. Discuss specific handoff requirements before booking."],
    ],
  },
};

const pages = Object.fromEntries(Object.entries(copy).map(([route, page]) => {
  const [, citySlug, serviceSlug] = route.split("/");
  return [route, { ...page, citySlug, serviceSlug, city: cities[citySlug], service: services[serviceSlug], sources: [...cities[citySlug].sources, ...services[serviceSlug].sources, "V", "C", "R"] }];
}));

module.exports = { pages, cities, services, sources };

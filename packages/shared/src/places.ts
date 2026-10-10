/**
 * Les pays, et les villes qu'on en connaît.
 *
 * Deux listes de nature différente, et c'est voulu. Les pays sont finis : on
 * peut les présenter tous, et un choix dans une liste vaut mieux que « Maroc »,
 * « maroc », « MAROC » et « Morrocco » dans la même colonne.
 *
 * Les villes ne le sont pas. Celles qui sont ici sont des suggestions — les
 * chefs-lieux et les villes d'où viennent les startups — et le champ reste
 * libre : une liste fermée aurait rejeté la personne qui travaille à Ouarzazate
 * le jour où nous avons oublié Ouarzazate, et c'est elle qui aurait eu tort.
 *
 * Écrites en anglais parce que les fiches le sont déjà — « Morocco », pas
 * « Maroc » — et qu'une colonne qui mélange les deux ne se trie plus.
 */

/** Tous les pays, pour la liste où l'on en choisit un. */
export const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahrain', 'Bangladesh', 'Belarus', 'Belgium', 'Benin', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czechia', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia',
  'Eswatini', 'Ethiopia', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia',
  'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan',
  'Kenya', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Lithuania',
  'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mauritania', 'Mauritius',
  'Mexico', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia',
  'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Palestine', 'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone',
  'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela',
  'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
] as const;

/**
 * Les villes proposées, par pays.
 *
 * Le Maroc d'abord et en entier — c'est là que presque tout se passe — puis
 * les pays d'où viennent les startups étrangères et où siègent les partenaires.
 * Un pays absent d'ici n'empêche rien : le champ reste libre.
 */
export const CITIES: Record<string, readonly string[]> = {
  Morocco: [
    'Agadir', 'Al Hoceïma', 'Azrou', 'Béni Mellal', 'Benguerir', 'Berkane', 'Berrechid', 'Casablanca',
    'Chefchaouen', 'Dakhla', 'El Jadida', 'Errachidia', 'Essaouira', 'Fès', 'Guelmim', 'Ifrane', 'Kénitra',
    'Khémisset', 'Khénifra', 'Khouribga', 'Laâyoune', 'Larache', 'Marrakech', 'Meknès', 'Mohammedia', 'Nador',
    'Ouarzazate', 'Oujda', 'Rabat', 'Safi', 'Salé', 'Settat', 'Sidi Kacem', 'Skhirat', 'Tanger', 'Tan-Tan',
    'Taourirt', 'Taroudant', 'Taza', 'Témara', 'Tétouan', 'Tiznit', 'Zagora',
  ],
  Algeria: ['Alger', 'Annaba', 'Batna', 'Constantine', 'Oran', 'Sétif', 'Tlemcen'],
  Tunisia: ['Bizerte', 'Gabès', 'Kairouan', 'Nabeul', 'Sfax', 'Sousse', 'Tunis'],
  Egypt: ['Alexandria', 'Cairo', 'Giza', 'Port Said'],
  Senegal: ['Dakar', 'Saint-Louis', 'Thiès'],
  'Ivory Coast': ['Abidjan', 'Bouaké', 'Yamoussoukro'],
  Nigeria: ['Abuja', 'Ibadan', 'Lagos', 'Port Harcourt'],
  Ghana: ['Accra', 'Kumasi', 'Takoradi'],
  Kenya: ['Kisumu', 'Mombasa', 'Nairobi'],
  'South Africa': ['Cape Town', 'Durban', 'Johannesburg', 'Pretoria'],
  Rwanda: ['Kigali'],
  Mauritania: ['Nouakchott'],
  Mali: ['Bamako'],
  France: ['Bordeaux', 'Lille', 'Lyon', 'Marseille', 'Montpellier', 'Nantes', 'Nice', 'Paris', 'Strasbourg', 'Toulouse'],
  Spain: ['Barcelona', 'Bilbao', 'Madrid', 'Málaga', 'Sevilla', 'Valencia'],
  Portugal: ['Lisbon', 'Porto'],
  Belgium: ['Antwerp', 'Brussels', 'Ghent'],
  Netherlands: ['Amsterdam', 'Eindhoven', 'Rotterdam', 'The Hague'],
  Germany: ['Berlin', 'Frankfurt', 'Hamburg', 'Munich'],
  Italy: ['Milan', 'Rome', 'Turin'],
  Switzerland: ['Geneva', 'Lausanne', 'Zurich'],
  'United Kingdom': ['Birmingham', 'Edinburgh', 'London', 'Manchester'],
  Ireland: ['Dublin'],
  'United States': ['Austin', 'Boston', 'Chicago', 'Los Angeles', 'Miami', 'New York', 'San Francisco', 'Seattle'],
  Canada: ['Montréal', 'Ottawa', 'Toronto', 'Vancouver'],
  'United Arab Emirates': ['Abu Dhabi', 'Dubai', 'Sharjah'],
  'Saudi Arabia': ['Dammam', 'Jeddah', 'Riyadh'],
  Qatar: ['Doha'],
  Turkey: ['Ankara', 'Istanbul', 'Izmir'],
  Jordan: ['Amman'],
  Lebanon: ['Beirut'],
};

/** Ce qu'on propose pour ce pays — rien du tout si on ne le connaît pas. */
export const citiesOf = (country: string): readonly string[] => CITIES[country.trim()] ?? [];

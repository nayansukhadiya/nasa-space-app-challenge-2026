/** Every dataset the app draws on, with the page a reader can open to check it. Shown in Layers → Data sources. */
export interface Source {
  what: string;
  name: string;
  href: string;
  licence: string;
}

export const SOURCES: Source[] = [
  {
    what: "Terrain: poles",
    name: "LOLA LDEM_80S / LDEM_60S (NASA PGDA)",
    href: "https://pgda.gsfc.nasa.gov/products/90",
    licence: "NASA data, open",
  },
  {
    what: "Terrain: whole Moon",
    name: "LOLA LDEM_4 (NASA PDS Geosciences Node)",
    href: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_4.lbl",
    licence: "NASA data, open",
  },
  {
    what: "Moon imagery",
    name: "LRO WAC mosaics (NASA Solar System Treks)",
    href: "https://trek.nasa.gov/moon/",
    licence: "NASA imagery, open",
  },
  {
    what: "Sky",
    name: "Milky Way panorama, ESO / S. Brunier",
    href: "https://commons.wikimedia.org/wiki/File:ESO_-_Milky_Way.jpg",
    licence: "CC BY 4.0",
  },
  {
    what: "Earth",
    name: "Blue Marble Next Generation (NASA Earth Observatory)",
    href: "https://commons.wikimedia.org/wiki/File:Blue_Marble_Next_Generation_%2B_topography_%2B_bathymetry.jpg",
    licence: "Public domain",
  },
  {
    what: "Sun, Earth, Moon positions",
    name: "astronomy-engine (IAU lunar rotation model)",
    href: "https://github.com/cosinekitty/astronomy",
    licence: "MIT",
  },
];

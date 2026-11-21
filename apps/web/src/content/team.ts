/** The people building HarvestSlot. Their own photos (not stock images), so they are not listed on /credits. */
export interface TeamMember {
  name: string;
  role: string;
  photo: { src: string; width: number; height: number; alt: string };
}

export const team: TeamMember[] = [
  {
    name: 'Quadri Kobiowu',
    role: 'Full-stack engineer',
    photo: { src: '/images/team/quadri-kobiowu.webp', width: 800, height: 1000, alt: 'Portrait of Quadri Kobiowu' },
  },
  {
    name: 'Babatunde Abdullahi',
    role: 'Business & research',
    photo: { src: '/images/team/babatunde-abdullahi.webp', width: 800, height: 1000, alt: 'Portrait of Babatunde Abdullahi' },
  },
];

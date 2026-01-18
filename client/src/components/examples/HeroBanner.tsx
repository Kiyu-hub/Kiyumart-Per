import HeroBanner from '../HeroBanner';
import heroImage from '@assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png';

export default function HeroBannerExample() {
  const slides = [
    {
      image: heroImage,
      title: "New Season Collection",
      description: "Discover the latest trends in fashion. Shop premium quality at unbeatable prices.",
      cta: "Shop Now"
    },
    {
      image: heroImage,
      title: "Summer Sale",
      description: "Up to 50% off on selected items. Limited time offer.",
      cta: "View Deals"
    }
  ];

  return <HeroBanner slides={slides} />;
}

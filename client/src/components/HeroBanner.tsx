import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface BannerSlide {
  image: string;
  title: string;
  description: string;
  cta: string;
}

interface HeroBannerProps {
  slides: BannerSlide[];
}

export default function HeroBanner({ slides }: HeroBannerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [, setLocation] = useLocation();

  const currentBanner = slides[currentSlide];

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleScrollDown = () => {
    const nextSection = document.querySelector('main, section');
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({
        top: window.innerHeight,
        behavior: 'smooth'
      });
    }
  };

  // Auto-advance slides every 5 seconds
  useEffect(() => {
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[400px] md:h-[600px] overflow-hidden bg-muted rounded-none">
      <div className="absolute inset-0">
        <img
          src={currentBanner.image}
          alt={currentBanner.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/20" />
      </div>

      <div className="relative h-full max-w-7xl mx-auto px-4 flex items-center">
        <div className="max-w-2xl text-white">
          <h2 className="text-4xl md:text-6xl font-bold mb-4" data-testid="text-hero-title">
            {currentBanner.title}
          </h2>
          <p className="text-lg md:text-xl mb-8 text-white/90" data-testid="text-hero-description">
            {currentBanner.description}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button 
              size="lg" 
              variant="default"
              className="backdrop-blur-md bg-primary hover:bg-primary/90"
              onClick={() => setLocation('/products')}
              data-testid="button-hero-shop-now"
            >
              Shop Now
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="backdrop-blur-md bg-white/10 border-white/30 text-white hover:bg-white/20"
              onClick={() => setLocation('/products')}
              data-testid="button-hero-explore"
            >
              Explore Collection
            </Button>
            <Button 
              size="lg" 
              variant="ghost"
              className="backdrop-blur-md text-white hover:bg-white/20"
              onClick={() => {
                const mainContent = document.querySelector('main');
                mainContent?.scrollIntoView({ behavior: 'smooth' });
              }}
              data-testid="button-hero-view-deals"
            >
              View Deals
            </Button>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 backdrop-blur-sm"
        onClick={prevSlide}
        aria-label="Previous slide"
        data-testid="button-prev-slide"
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 backdrop-blur-sm"
        onClick={nextSlide}
        aria-label="Next slide"
        data-testid="button-next-slide"
      >
        <ChevronRight className="h-8 w-8" />
      </Button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all ${
              index === currentSlide ? "bg-white w-8" : "bg-white/50"
            }`}
            onClick={() => setCurrentSlide(index)}
            data-testid={`button-slide-${index}`}
          />
        ))}
      </div>

      <button
        onClick={handleScrollDown}
        className="absolute bottom-8 right-8 group cursor-pointer animate-bounce"
        aria-label="Scroll down"
        data-testid="button-scroll-down"
      >
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 bg-white/20 backdrop-blur-md rounded-full group-hover:bg-white/30 transition-colors" />
          <div className="absolute inset-0 flex items-center justify-center">
            <ChevronDown className="h-6 w-6 text-white" />
          </div>
        </div>
      </button>
    </div>
  );
}

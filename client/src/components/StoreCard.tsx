import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Store as StoreIcon, ShoppingBag } from "lucide-react";

interface Store {
  id: string;
  name: string;
  logo?: string;
  banner?: string;
  description?: string;
}

interface StoreCardProps {
  id?: string;
  name: string;
  logo?: string;
  banner?: string;
  store?: Store;
  onClick?: (id: string) => void;
}

export default function StoreCard({
  id,
  name,
  logo,
  banner,
  store,
  onClick,
}: StoreCardProps) {
  const [, navigate] = useLocation();

  const handleClick = () => {
    if (onClick && id) {
      onClick(id);
    } else if (store) {
      navigate(`/sellers/${store.id}`);
    } else if (id) {
      navigate(`/sellers/${id}`);
    }
  };

  const displayImage = banner || logo;

  return (
    <Card
      className="group overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
      onClick={handleClick}
      data-testid={`card-store-${id || store?.id}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {displayImage ? (
          <img
            src={displayImage}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <StoreIcon className="w-12 h-12 text-primary/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 p-4">
          {logo && banner && (
            <div className="mb-2 w-12 h-12 rounded-full bg-white p-1 shadow-lg">
              <img
                src={logo}
                alt={`${name} logo`}
                className="w-full h-full object-contain rounded-full"
              />
            </div>
          )}
          <h3 className="text-lg font-semibold text-white drop-shadow-lg" data-testid={`text-store-name-${id || store?.id}`}>
            {name}
          </h3>
          <div className="flex items-center gap-1 text-sm text-white/90 mt-1">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Visit Store</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

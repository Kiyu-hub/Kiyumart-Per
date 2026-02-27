import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/UserAvatar";

interface DeliveryStep {
  label: string;
  time?: string;
  completed: boolean;
}

interface DeliveryTrackerProps {
  orderId: string;
  riderName?: string;
  riderPhone?: string;
  riderProfileImage?: string | null;
  steps: DeliveryStep[];
  estimatedArrival?: string;
}

export default function DeliveryTracker({
  orderId,
  riderName,
  riderPhone,
  riderProfileImage,
  steps,
  estimatedArrival,
}: DeliveryTrackerProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Order Tracking</CardTitle>
          <Badge data-testid="badge-order-id">#{orderId}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
          <div className="text-center p-6">
            <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Live Map View
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              (Map integration with OpenStreetMap/Leaflet)
            </p>
          </div>
        </div>

        {riderName && (
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <UserAvatar profileImage={riderProfileImage} name={riderName} size="md" />
              <div>
                <p className="font-medium" data-testid="text-rider-name">
                  {riderName}
                </p>
                <p className="text-sm text-muted-foreground">Delivery Rider</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              data-testid="button-call-rider"
              onClick={() => riderPhone && window.open(`tel:${riderPhone}`, '_self')}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        )}

        {estimatedArrival && (
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
            <span className="text-sm font-medium">Estimated Arrival</span>
            <span className="text-sm font-bold" data-testid="text-eta">
              {estimatedArrival}
            </span>
          </div>
        )}

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-4" data-testid={`step-${index}`}>
              <div className="flex flex-col items-center">
                {step.completed ? (
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground" />
                )}
                {index < steps.length - 1 && (
                  <div
                    className={`w-0.5 h-12 mt-2 ${
                      step.completed ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
              <div className="flex-1 pb-8">
                <p
                  className={`font-medium ${
                    step.completed ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {step.time && (
                  <p className="text-sm text-muted-foreground mt-1">{step.time}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

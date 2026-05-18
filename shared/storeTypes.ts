import { z } from "zod";

export const STORE_TYPES = [
  "clothing",
  "electronics",
  "food_beverages",
  "beauty_cosmetics",
  "home_garden",
  "sports_fitness",
  "books_media",
  "toys_games",
  "automotive",
  "health_wellness",
  "restaurant",
] as const;

// Store types that belong to food businesses — hidden from general "store" registration
export const FOOD_STORE_TYPES = new Set(["food_beverages", "restaurant"] as const);

export type StoreType = typeof STORE_TYPES[number];

/**
 * Helpers for splitting the admin UI into two consistent buckets:
 *   - General Stores                  → everything that isn't food
 *   - Restaurants & Local Vendors     → food_beverages + restaurant
 *
 * Every admin page (sellers, applications, stores, products, categories,
 * banners, user create/edit) must use these to avoid mixing food merchants
 * with general merchants. Food storeTypes are surfaced ONLY in the food tab.
 */
export const GENERAL_STORE_TYPES: StoreType[] = STORE_TYPES.filter(
  (t) => !FOOD_STORE_TYPES.has(t as any),
);

export const FOOD_STORE_TYPE_LIST: StoreType[] = STORE_TYPES.filter(
  (t) => FOOD_STORE_TYPES.has(t as any),
);

export type StoreKind = "general" | "food";

export const STORE_KIND_LABELS: Record<StoreKind, string> = {
  general: "General Stores",
  food: "Restaurants & Local Vendors",
};

export function isFoodStoreType(storeType?: string | null): boolean {
  if (!storeType) return false;
  return FOOD_STORE_TYPES.has(storeType as any);
}

export function getStoreKind(storeType?: string | null): StoreKind {
  return isFoodStoreType(storeType) ? "food" : "general";
}

export function getStoreTypesForKind(kind: StoreKind): StoreType[] {
  return kind === "food" ? FOOD_STORE_TYPE_LIST : GENERAL_STORE_TYPES;
}

export interface DynamicField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "multiselect" | "number" | "date";
  placeholder?: string;
  options?: string[];
  description?: string;
  required?: boolean;
}

export interface StoreTypeVariantConfig {
  primaryLabel: string;
  primaryPlaceholder: string;
  secondaryLabel: string;
  secondaryPlaceholder: string;
  secondaryPresetOptions: string[];
  secondaryDescription: string;
  sectionDescription: string;
  groupLabel: string;
  optionsLabel: string;
  emptyStateLabel: string;
  emptyStateDescription: string;
  addOptionCta: string;
  stockSetupDescription: string;
  perOptionStockDescription: string;
  supportsSizeGuide: boolean;
  sizeGuideLabel: string;
}

export const STORE_TYPE_CONFIG: Record<StoreType, {
  label: string;
  description: string;
  icon: string;
  productFields: DynamicField[];
}> = {
  clothing: {
    label: "Clothing & Fashion",
    description: "Apparel, accessories, and fashion items",
    icon: "👗",
    productFields: [
      {
        name: "sizes",
        label: "Available Sizes",
        type: "multiselect",
        options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
        description: "Select all sizes you typically offer",
        required: true,
      },
      {
        name: "colors",
        label: "Available Colors",
        type: "text",
        placeholder: "e.g., Black, White, Red, Blue",
        description: "Common colors in your inventory",
        required: true,
      },
      {
        name: "materials",
        label: "Common Materials",
        type: "text",
        placeholder: "e.g., Cotton, Polyester, Silk",
        description: "Materials you work with",
        required: false,
      },
      {
        name: "genderCategory",
        label: "Target Gender",
        type: "select",
        options: ["Men", "Women", "Unisex", "Kids"],
        description: "Primary customer demographic",
        required: true,
      },
    ],
  },
  electronics: {
    label: "Electronics & Gadgets",
    description: "Tech products, gadgets, and electronic devices",
    icon: "💻",
    productFields: [
      {
        name: "brands",
        label: "Brands You Carry",
        type: "text",
        placeholder: "e.g., Samsung, Apple, HP",
        description: "Electronics brands you sell",
        required: true,
      },
      {
        name: "warrantyPeriod",
        label: "Typical Warranty Period",
        type: "select",
        options: ["No Warranty", "3 Months", "6 Months", "1 Year", "2 Years"],
        description: "Standard warranty you offer",
        required: true,
      },
      {
        name: "productCategories",
        label: "Product Categories",
        type: "multiselect",
        options: ["Phones", "Laptops", "Tablets", "Accessories", "Audio", "Gaming", "Smart Home"],
        description: "Types of electronics you sell",
        required: true,
      },
    ],
  },
  food_beverages: {
    label: "Food & Beverages",
    description: "Food products, local dishes, drinks, and consumables",
    icon: "🍔",
    productFields: [
      {
        name: "foodType",
        label: "Food Type",
        type: "multiselect",
        options: ["Cooked Meals / Local Dishes", "Street Food", "Fresh Produce", "Packaged Foods", "Beverages", "Snacks", "Frozen Foods", "Bakery / Pastry", "Dairy"],
        description: "Types of food you sell",
        required: true,
      },
      {
        name: "certifications",
        label: "Certifications (optional)",
        type: "multiselect",
        options: ["Halal", "Organic", "FDA Approved", "Kosher", "Vegan", "Gluten-Free"],
        description: "Food certifications you have",
        required: false,
      },
      {
        name: "storageRequirements",
        label: "Storage Capabilities",
        type: "multiselect",
        options: ["Room Temperature", "Refrigerated", "Frozen", "Serve Fresh / Hot"],
        description: "How you store or serve products",
        required: false,
      },
    ],
  },
  beauty_cosmetics: {
    label: "Beauty & Cosmetics",
    description: "Skincare, makeup, and beauty products",
    icon: "💄",
    productFields: [
      {
        name: "productTypes",
        label: "Product Types",
        type: "multiselect",
        options: ["Skincare", "Makeup", "Haircare", "Fragrances", "Nail Care", "Body Care", "Men's Grooming"],
        description: "Beauty categories you offer",
        required: true,
      },
      {
        name: "brands",
        label: "Brands You Carry",
        type: "text",
        placeholder: "e.g., L'Oréal, MAC, Nivea",
        description: "Beauty brands you sell",
        required: true,
      },
      {
        name: "skinTypes",
        label: "Skin Types Catered To",
        type: "multiselect",
        options: ["All Skin Types", "Oily", "Dry", "Combination", "Sensitive", "Normal"],
        description: "Target skin types",
        required: false,
      },
    ],
  },
  home_garden: {
    label: "Home & Garden",
    description: "Home decor, furniture, and garden supplies",
    icon: "🏡",
    productFields: [
      {
        name: "productCategories",
        label: "Product Categories",
        type: "multiselect",
        options: ["Furniture", "Decor", "Kitchen", "Bedding", "Garden Tools", "Plants", "Lighting", "Storage"],
        description: "Home & garden items you sell",
        required: true,
      },
      {
        name: "materials",
        label: "Common Materials",
        type: "text",
        placeholder: "e.g., Wood, Metal, Plastic, Fabric",
        description: "Materials in your products",
        required: false,
      },
    ],
  },
  sports_fitness: {
    label: "Sports & Fitness",
    description: "Sporting goods, fitness equipment, and activewear",
    icon: "⚽",
    productFields: [
      {
        name: "categories",
        label: "Sports Categories",
        type: "multiselect",
        options: ["Fitness Equipment", "Sportswear", "Outdoor Sports", "Team Sports", "Water Sports", "Cycling", "Yoga"],
        description: "Sports categories you cover",
        required: true,
      },
      {
        name: "brands",
        label: "Brands You Carry",
        type: "text",
        placeholder: "e.g., Nike, Adidas, Puma",
        description: "Sports brands you sell",
        required: false,
      },
    ],
  },
  books_media: {
    label: "Books & Media",
    description: "Books, magazines, music, and movies",
    icon: "📚",
    productFields: [
      {
        name: "mediaTypes",
        label: "Media Types",
        type: "multiselect",
        options: ["Books", "E-Books", "Magazines", "Music CDs", "DVDs", "Audiobooks", "Comics"],
        description: "Types of media you sell",
        required: true,
      },
      {
        name: "genres",
        label: "Primary Genres",
        type: "text",
        placeholder: "e.g., Fiction, Non-Fiction, Educational",
        description: "Main genres you focus on",
        required: false,
      },
    ],
  },
  toys_games: {
    label: "Toys & Games",
    description: "Toys, games, and children's products",
    icon: "🎮",
    productFields: [
      {
        name: "ageGroups",
        label: "Age Groups",
        type: "multiselect",
        options: ["0-2 years", "3-5 years", "6-8 years", "9-12 years", "Teens", "Adults"],
        description: "Target age ranges",
        required: true,
      },
      {
        name: "categories",
        label: "Product Categories",
        type: "multiselect",
        options: ["Action Figures", "Board Games", "Educational", "Electronic Games", "Outdoor Toys", "Puzzles", "Dolls"],
        description: "Types of toys & games",
        required: true,
      },
    ],
  },
  automotive: {
    label: "Automotive",
    description: "Car parts, accessories, and automotive products",
    icon: "🚗",
    productFields: [
      {
        name: "productTypes",
        label: "Product Types",
        type: "multiselect",
        options: ["Parts & Components", "Accessories", "Tools", "Oils & Fluids", "Tires", "Electronics", "Cleaning"],
        description: "Automotive products you sell",
        required: true,
      },
      {
        name: "vehicleTypes",
        label: "Vehicle Types",
        type: "multiselect",
        options: ["Cars", "Trucks", "Motorcycles", "SUVs", "Vans"],
        description: "Vehicles you cater to",
        required: false,
      },
    ],
  },
  health_wellness: {
    label: "Health & Wellness",
    description: "Health products, supplements, and wellness items",
    icon: "⚕️",
    productFields: [
      {
        name: "productCategories",
        label: "Product Categories",
        type: "multiselect",
        options: ["Vitamins & Supplements", "Medical Devices", "First Aid", "Personal Care", "Fitness Nutrition", "Herbal Products"],
        description: "Health products you offer",
        required: true,
      },
      {
        name: "certifications",
        label: "Certifications",
        type: "multiselect",
        options: ["FDA Approved", "Organic", "GMP Certified", "Halal", "Vegan"],
        description: "Product certifications",
        required: false,
      },
    ],
  },
  restaurant: {
    label: "Restaurant",
    description: "Restaurant menu items, dishes & drinks",
    icon: "🍽️",
    productFields: [
      {
        name: "cuisineType",
        label: "Cuisine Type",
        type: "select",
        options: ["Ghanaian", "West African", "Continental", "Chinese", "Fast Food", "Grills & BBQ", "Seafood", "Italian", "Indian", "Café & Pastry", "Mixed / Other"],
        description: "The primary cuisine your restaurant serves",
        required: true,
      },
      {
        name: "mealCategory",
        label: "Meal Category",
        type: "select",
        options: ["Starter", "Main Course", "Side Dish", "Dessert", "Drink / Beverage", "Combo / Set Meal"],
        description: "Where this item falls on the menu",
        required: true,
      },
      {
        name: "prepTime",
        label: "Preparation Time",
        type: "text",
        placeholder: "e.g. 15 mins, 30 mins",
        description: "Average time to prepare this dish",
        required: true,
      },
      {
        name: "portionSize",
        label: "Portion Size",
        type: "select",
        options: ["Small", "Regular", "Large", "Family Size"],
        description: "Serving size for this item",
        required: false,
      },
      {
        name: "dietaryTags",
        label: "Dietary Tags",
        type: "multiselect",
        options: ["Vegetarian", "Vegan", "Halal", "Gluten-Free", "Dairy-Free", "Spicy", "Nut-Free"],
        description: "Applicable dietary labels",
        required: false,
      },
      {
        name: "spiceLevel",
        label: "Spice Level",
        type: "select",
        options: ["Not Spicy", "Mild", "Medium", "Hot", "Extra Hot"],
        description: "Heat level of this dish",
        required: false,
      },
    ],
  },
};

export function getStoreTypeSchema(storeType: StoreType) {
  const config = STORE_TYPE_CONFIG[storeType];
  const schemaFields: Record<string, z.ZodType> = {};
  
  config.productFields.forEach((field) => {
    if (field.type === "multiselect") {
      const arraySchema = z.array(z.string());
      schemaFields[field.name] = field.required ? arraySchema.min(1) : arraySchema.optional();
    } else if (field.type === "select") {
      const selectSchema = z.string();
      schemaFields[field.name] = field.required ? selectSchema.min(1) : selectSchema.optional();
    } else if (field.type === "number") {
      const numberSchema = z.number();
      schemaFields[field.name] = field.required ? numberSchema : numberSchema.optional();
    } else {
      const stringSchema = z.string();
      schemaFields[field.name] = field.required ? stringSchema.min(1) : stringSchema.optional();
    }
  });
  
  return z.object(schemaFields);
}

export function getStoreTypeLabel(storeType: StoreType): string {
  return STORE_TYPE_CONFIG[storeType]?.label || storeType;
}

export function getStoreTypeFields(storeType: StoreType): DynamicField[] {
  return STORE_TYPE_CONFIG[storeType]?.productFields || [];
}

export const STORE_TYPE_PRODUCT_CONFIG: Record<StoreType, DynamicField[]> = {
  clothing: [
    { name: "fitType", label: "Fit Type", type: "select", options: ["Slim fit", "Regular fit", "Relaxed fit", "Oversized"], required: true, description: "Choose how this item fits on the body." },
    { name: "material", label: "Material", type: "text", placeholder: "e.g. Chiffon, Cotton, Crepe", required: true, description: "Main fabric or material used for this product." },
    { name: "careInstructions", label: "Care Instructions", type: "textarea", placeholder: "e.g. Hand wash cold, iron on low heat", required: true, description: "Simple washing and care instructions for buyers." },
    { name: "occasion", label: "Best For", type: "multiselect", options: ["Everyday wear", "Office", "Prayer", "Wedding", "Party", "Travel", "Special occasion"], required: true, description: "Where buyers are most likely to wear this item." },
    { name: "genderTarget", label: "Target Wearer", type: "select", options: ["Women", "Men", "Unisex", "Girls", "Boys"], required: true, description: "Who this clothing item is designed for." },
  ],
  electronics: [
    { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Samsung, Apple, JBL", required: true, description: "Brand name buyers will recognize." },
    { name: "model", label: "Model", type: "text", placeholder: "e.g. Galaxy A55, WH-1000XM5", required: true, description: "Exact model or series for this item." },
    { name: "keySpecs", label: "Key Specifications", type: "textarea", placeholder: "e.g. 8GB RAM, 256GB storage, Bluetooth 5.3", required: true, description: "List the most important product specifications." },
    { name: "warranty", label: "Warranty", type: "select", options: ["No warranty", "7 days", "30 days", "3 months", "6 months", "1 year"], required: true, description: "Warranty period buyers will receive." },
    { name: "condition", label: "Condition", type: "select", options: ["Brand new", "Open box", "Refurbished"], required: true, description: "State the condition clearly." },
  ],
  food_beverages: [
    { name: "foodType", label: "Food Type", type: "select", options: ["Cooked meal / Local dish", "Street food", "Packaged food", "Beverage", "Snack", "Fresh produce", "Frozen item", "Bakery", "Pastry / Dessert", "Other"], required: true, description: "Choose the product type." },
    { name: "prepTime", label: "Preparation Time", type: "select", options: ["Ready immediately", "5–10 minutes", "10–20 minutes", "20–30 minutes", "30–45 minutes", "45–60 minutes", "Pre-order only"], required: false, description: "How long does it take to prepare this item after an order is placed?" },
    { name: "portionOrWeight", label: "Portion / Pack Size", type: "text", placeholder: "e.g. One plate, 500g, 1L, Pack of 2", required: false, description: "Describe the serving size or pack quantity." },
    { name: "ingredients", label: "Ingredients / Contents", type: "textarea", placeholder: "List the main ingredients or food contents (optional for local dishes)", required: false, description: "Helps buyers know what is in the food." },
    { name: "storageGuide", label: "Storage / Serving Guide", type: "select", options: ["Serve fresh / hot", "Room temperature", "Keep refrigerated", "Keep frozen"], required: false, description: "How should buyers store or serve this item." },
    { name: "allergyNote", label: "Allergy / Dietary Note", type: "text", placeholder: "e.g. Contains nuts, Halal, Vegan-friendly", required: false, description: "Optional note for buyers with dietary needs." },
  ],
  beauty_cosmetics: [
    { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Nivea, MAC, Cerave", required: true, description: "Brand name for the product." },
    { name: "productType", label: "Product Type", type: "select", options: ["Skincare", "Makeup", "Haircare", "Fragrance", "Body care", "Men's grooming"], required: true, description: "Choose the beauty category." },
    { name: "skinOrHairType", label: "Best For", type: "multiselect", options: ["All skin types", "Oily skin", "Dry skin", "Sensitive skin", "Normal skin", "All hair types", "Dry hair", "Curly hair"], required: true, description: "Show who this product works best for." },
    { name: "benefits", label: "Main Benefits", type: "textarea", placeholder: "e.g. Hydrates, brightens, smooths texture", required: true, description: "Short summary of the product benefits." },
    { name: "sizeVolume", label: "Size / Volume", type: "text", placeholder: "e.g. 100ml, 250g", required: true, description: "State the product quantity clearly." },
  ],
  home_garden: [
    { name: "material", label: "Material", type: "text", placeholder: "e.g. Wood, Steel, Cotton", required: true, description: "Main material used for this item." },
    { name: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g. 120 x 60 x 75 cm", required: true, description: "Give the size of the product." },
    { name: "useArea", label: "Best For", type: "multiselect", options: ["Living room", "Bedroom", "Kitchen", "Bathroom", "Office", "Outdoor", "Garden"], required: true, description: "Where this item fits best." },
    { name: "assemblyNeeded", label: "Assembly Needed", type: "select", options: ["No", "Yes - simple", "Yes - full assembly"], required: true, description: "Let buyers know if setup is needed." },
    { name: "careInstructions", label: "Care Instructions", type: "textarea", placeholder: "e.g. Wipe with dry cloth", required: false, description: "Optional care note for buyers." },
  ],
  sports_fitness: [
    { name: "sportCategory", label: "Sport / Activity", type: "multiselect", options: ["Gym", "Running", "Football", "Cycling", "Yoga", "Outdoor", "Home workout"], required: true, description: "Choose the activities this product supports." },
    { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Nike, Adidas, Puma", required: false, description: "Add the brand if available." },
    { name: "material", label: "Material", type: "text", placeholder: "e.g. Polyester, Rubber, Foam", required: true, description: "Main material or build." },
    { name: "skillLevel", label: "Skill Level", type: "select", options: ["Beginner", "Intermediate", "Advanced", "All levels"], required: true, description: "Who this product is best for." },
    { name: "usageNote", label: "Usage Note", type: "textarea", placeholder: "e.g. Good for indoor and outdoor training", required: false, description: "Optional quick usage note." },
  ],
  books_media: [
    { name: "authorOrCreator", label: "Author / Creator", type: "text", placeholder: "e.g. Chimamanda Ngozi Adichie", required: true, description: "Author, artist, or creator name." },
    { name: "format", label: "Format", type: "select", options: ["Paperback", "Hardcover", "E-book", "Audio CD", "DVD", "Digital download"], required: true, description: "Choose the product format." },
    { name: "genre", label: "Genre", type: "text", placeholder: "e.g. Fiction, Business, Education", required: true, description: "Main genre or category." },
    { name: "language", label: "Language", type: "text", placeholder: "e.g. English, Arabic, French", required: true, description: "Main language of the item." },
    { name: "summary", label: "Quick Summary", type: "textarea", placeholder: "Short note about the book or media item", required: true, description: "A helpful short summary for buyers." },
  ],
  toys_games: [
    { name: "ageRange", label: "Age Range", type: "select", options: ["0-2 years", "3-5 years", "6-8 years", "9-12 years", "13+ years"], required: true, description: "Pick the right age range." },
    { name: "toyType", label: "Toy Type", type: "select", options: ["Educational", "Board game", "Puzzle", "Action figure", "Doll", "Outdoor toy", "Electronic toy"], required: true, description: "Select the main toy category." },
    { name: "material", label: "Material", type: "text", placeholder: "e.g. Plastic, Wood, Fabric", required: false, description: "Optional material info." },
    { name: "safetyNote", label: "Safety Note", type: "textarea", placeholder: "e.g. Not for children under 3 years", required: true, description: "Important safety information." },
    { name: "skillsDeveloped", label: "Learning Benefit", type: "multiselect", options: ["Creativity", "Coordination", "Logic", "Problem solving", "Social play", "Motor skills"], required: false, description: "Optional developmental benefit." },
  ],
  automotive: [
    { name: "brand", label: "Brand", type: "text", placeholder: "e.g. Toyota, Bosch, Michelin", required: true, description: "Brand of the part or accessory." },
    { name: "vehicleCompatibility", label: "Vehicle Compatibility", type: "textarea", placeholder: "e.g. Toyota Corolla 2014-2018", required: true, description: "List the vehicles or models this item fits." },
    { name: "productType", label: "Product Type", type: "select", options: ["Part", "Accessory", "Tool", "Fluid", "Cleaning"], required: true, description: "Choose the automotive product type." },
    { name: "condition", label: "Condition", type: "select", options: ["Brand new", "Refurbished", "Used"], required: true, description: "State the item condition clearly." },
    { name: "installationNote", label: "Installation Note", type: "textarea", placeholder: "e.g. Professional installation recommended", required: false, description: "Optional fitting or installation note." },
  ],
  health_wellness: [
    { name: "productCategory", label: "Product Category", type: "select", options: ["Supplement", "Medical supply", "Wellness device", "Personal care", "Fitness nutrition"], required: true, description: "Choose the product category." },
    { name: "barcode", label: "Barcode / UPC", type: "text", placeholder: "e.g. 012345678905", required: false, description: "Barcode or UPC number printed on the product packaging." },
    { name: "prescriptionRequired", label: "Prescription Required", type: "select", options: ["No", "Yes – prescription required", "Yes – pharmacist consultation required"], required: true, description: "Let buyers know whether a prescription or consultation is needed before purchase." },
    { name: "usageDirections", label: "How To Use", type: "textarea", placeholder: "Add simple usage directions", required: true, description: "Explain how the buyer should use this product." },
    { name: "keyIngredients", label: "Key Ingredients / Components", type: "textarea", placeholder: "List the main active ingredients or components", required: true, description: "Important for product clarity and trust." },
    { name: "warnings", label: "Important Warnings", type: "textarea", placeholder: "e.g. Keep out of reach of children", required: false, description: "Optional safety information." },
    { name: "certification", label: "Certification", type: "multiselect", options: ["FDA approved", "Organic", "GMP certified", "Halal", "Vegan"], required: false, description: "Add any relevant certification." },
  ],
  restaurant: [
    { name: "cuisineType", label: "Cuisine Type", type: "select", options: ["Ghanaian", "West African", "Continental", "Chinese", "Fast Food", "Grills & BBQ", "Seafood", "Italian", "Indian", "Café & Pastry", "Mixed / Other"], required: true, description: "Choose the cuisine style." },
    { name: "mealCategory", label: "Meal Category", type: "select", options: ["Main course", "Appetizer / Starter", "Side dish", "Dessert", "Drink / Beverage", "Combo / Meal deal"], required: true, description: "Categorize this menu item." },
    { name: "prepTime", label: "Preparation Time", type: "select", options: ["Ready immediately", "5–10 minutes", "10–20 minutes", "20–30 minutes", "30–45 minutes", "45–60 minutes", "Pre-order only"], required: false, description: "Estimated preparation time after order is placed." },
    { name: "portionSize", label: "Portion Size", type: "select", options: ["Small", "Regular", "Large", "Family size", "Per piece", "Per pack"], required: false, description: "Serving size for this item." },
    { name: "dietaryTags", label: "Dietary Info", type: "multiselect", options: ["Halal", "Vegan", "Vegetarian", "Gluten-free", "Dairy-free", "Spicy", "Nut-free"], required: false, description: "Add relevant dietary labels." },
    { name: "spiceLevel", label: "Spice Level", type: "select", options: ["Mild", "Medium", "Hot", "Extra hot", "Not applicable"], required: false, description: "Optional heat level for this dish." },
  ],
};

function buildDynamicFieldSchema(field: DynamicField) {
  if (field.type === "multiselect") {
    const arraySchema = z.array(z.string().trim());
    return field.required
      ? arraySchema.default([]).refine((value) => value.length > 0, `${field.label} is required`)
      : arraySchema.default([]);
  }

  if (field.type === "select") {
    const selectSchema = z.string().trim();
    return field.required ? selectSchema.min(1, `${field.label} is required`) : selectSchema.optional();
  }

  if (field.type === "number") {
    const numberSchema = z.number();
    return field.required ? numberSchema : numberSchema.optional();
  }

  const stringSchema = z.string().trim();
  return field.required ? stringSchema.min(1, `${field.label} is required`) : stringSchema.optional();
}

function getDefaultDynamicFieldValue(field: DynamicField) {
  if (field.type === "multiselect") return [];
  if (field.type === "number") return 0;
  return "";
}

export function getStoreTypeProductFields(storeType: StoreType): DynamicField[] {
  return STORE_TYPE_PRODUCT_CONFIG[storeType] || [];
}

export function getStoreTypeProductSchema(storeType: StoreType) {
  const schemaFields: Record<string, z.ZodTypeAny> = {};
  getStoreTypeProductFields(storeType).forEach((field) => {
    schemaFields[field.name] = buildDynamicFieldSchema(field);
  });
  return z.object(schemaFields);
}

export function buildStoreTypeProductDefaults(
  storeType: StoreType,
  raw?: Record<string, any> | null,
): Record<string, any> {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized: Record<string, any> = {};

  for (const field of getStoreTypeProductFields(storeType)) {
    const value = source[field.name];
    if (field.type === "multiselect") {
      normalized[field.name] = Array.isArray(value)
        ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      continue;
    }

    if (field.type === "number") {
      normalized[field.name] = Number.isFinite(Number(value)) ? Number(value) : getDefaultDynamicFieldValue(field);
      continue;
    }

    normalized[field.name] = typeof value === "string" ? value : getDefaultDynamicFieldValue(field);
  }

  return normalized;
}

const CLOTHING_VARIANT_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Standard", "Free size"];
const ELECTRONICS_VARIANT_OPTIONS = ["64GB", "128GB", "256GB", "512GB", "1TB", "UK Plug", "EU Plug", "Type-C", "Lightning", "Bluetooth", "Wi-Fi"];
const FOOD_VARIANT_OPTIONS = ["Small portion", "Medium portion", "Large portion", "Extra large", "Single serving", "Double serving", "Family size", "250g", "500g", "1kg", "330ml", "500ml", "1L", "Pack of 2", "Pack of 3", "Pack of 6", "With extras", "Without extras"];
const BEAUTY_VARIANT_OPTIONS = ["30ml", "50ml", "100ml", "250ml", "Travel size", "Full size", "Shade 01", "Shade 02", "Shade 03"];
const HOME_VARIANT_OPTIONS = ["Small", "Medium", "Large", "Set of 2", "Set of 4", "Queen", "King"];
const SPORTS_VARIANT_OPTIONS = ["Small", "Medium", "Large", "Size 5", "Size 6", "Left", "Right", "Pair"];
const BOOKS_VARIANT_OPTIONS = ["Paperback", "Hardcover", "E-book", "Audio", "DVD", "Blu-ray"];
const TOYS_VARIANT_OPTIONS = ["Starter pack", "Standard set", "Large set", "Blue", "Pink", "Educational kit"];
const AUTOMOTIVE_VARIANT_OPTIONS = ["Universal", "Front", "Rear", "Left", "Right", "12V", "24V"];
const HEALTH_VARIANT_OPTIONS = ["30 capsules", "60 capsules", "90 capsules", "100ml", "250ml", "Single unit", "Pack of 2"];

const DEFAULT_VARIANT_CONFIG: StoreTypeVariantConfig = {
  primaryLabel: "Primary Option",
  primaryPlaceholder: "e.g. Black, Gloss finish, Citrus",
  secondaryLabel: "Secondary Option",
  secondaryPlaceholder: "e.g. Standard, 500ml, 128GB",
  secondaryPresetOptions: [],
  secondaryDescription: "Add the main option buyers will choose under this product.",
  sectionDescription: "Add each product option clearly and keep the images and stock tied to that exact option.",
  groupLabel: "Primary Option",
  optionsLabel: "Options",
  emptyStateLabel: "No product options created yet",
  emptyStateDescription: "Add at least one product option before saving this product.",
  addOptionCta: "Add Option",
  stockSetupDescription: "Choose how stock should work for this option.",
  perOptionStockDescription: "Enter the stock available for each option you added.",
  supportsSizeGuide: false,
  sizeGuideLabel: "Option Guide",
};

export function getStoreTypeVariantConfig(storeType?: StoreType | null): StoreTypeVariantConfig {
  switch (storeType) {
    case "clothing":
      return {
        primaryLabel: "Color",
        primaryPlaceholder: "e.g. Red, Mixed colors",
        secondaryLabel: "Size",
        secondaryPlaceholder: "e.g. 44, 44UK, Tall, Long",
        secondaryPresetOptions: CLOTHING_VARIANT_OPTIONS,
        secondaryDescription: "Add every size available for this color.",
        sectionDescription: "Add each color as its own variant, attach 3-5 images for that color, choose the sizes, and set the stock for that color.",
        groupLabel: "Color",
        optionsLabel: "Sizes",
        emptyStateLabel: "No variants created yet",
        emptyStateDescription: "Add at least one color variant before saving this product.",
        addOptionCta: "Add Size",
        stockSetupDescription: "Choose how stock should work for this color. You can keep one number for the whole color or set stock for each size.",
        perOptionStockDescription: "Enter the stock available for each size you added.",
        supportsSizeGuide: true,
        sizeGuideLabel: "Size Guide",
      };
    case "electronics":
      return {
        primaryLabel: "Option Group",
        primaryPlaceholder: "e.g. Black, Silver, Matte black",
        secondaryLabel: "Specification",
        secondaryPlaceholder: "e.g. 128GB, UK Plug, Type-C",
        secondaryPresetOptions: ELECTRONICS_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact specification buyers will choose for this option group.",
        sectionDescription: "Add each finish or model option with its own images, then list the exact specifications buyers can choose under it.",
        groupLabel: "Option Group",
        optionsLabel: "Specifications",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one option group before saving this product.",
        addOptionCta: "Add Specification",
        stockSetupDescription: "Choose how stock should work for this option group. Separate stock is best when each specification has its own inventory.",
        perOptionStockDescription: "Enter the stock available for each specification you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Specification Guide",
      };
    case "food_beverages":
      return {
        primaryLabel: "Flavor / Variant",
        primaryPlaceholder: "e.g. Original, Spicy, Special, With egg",
        secondaryLabel: "Portion / Pack Size",
        secondaryPlaceholder: "e.g. Small, Medium, Large, 500g, 1L",
        secondaryPresetOptions: FOOD_VARIANT_OPTIONS,
        secondaryDescription: "Add the portion size or pack quantity buyers will choose.",
        sectionDescription: "Optionally add variants for different flavors or portion sizes. For simple products (single price, no options), you can skip variants and just set stock directly.",
        groupLabel: "Flavor / Variant",
        optionsLabel: "Portions / Sizes",
        emptyStateLabel: "No variants added",
        emptyStateDescription: "You can add portions or flavors as variants, or leave this empty and use the stock quantity field directly.",
        addOptionCta: "Add Portion / Size",
        stockSetupDescription: "Choose how stock should work for this variant.",
        perOptionStockDescription: "Enter the stock available for each portion or size you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Portion Guide",
      };
    case "beauty_cosmetics":
      return {
        primaryLabel: "Shade / Scent",
        primaryPlaceholder: "e.g. Nude, Rose, Vanilla",
        secondaryLabel: "Option",
        secondaryPlaceholder: "e.g. 50ml, Full size, Shade 02",
        secondaryPresetOptions: BEAUTY_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact option buyers will choose for this shade or scent.",
        sectionDescription: "Add each shade or scent with its own images, then list the options buyers can pick under it.",
        groupLabel: "Shade / Scent",
        optionsLabel: "Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one shade or scent before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this shade or scent.",
        perOptionStockDescription: "Enter the stock available for each option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    case "home_garden":
      return {
        primaryLabel: "Finish / Style",
        primaryPlaceholder: "e.g. Oak, White, Minimal",
        secondaryLabel: "Option",
        secondaryPlaceholder: "e.g. Small, Medium, Set of 4",
        secondaryPresetOptions: HOME_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact size or set option buyers will choose.",
        sectionDescription: "Add each finish or style with its own images, then list the available options under it.",
        groupLabel: "Finish / Style",
        optionsLabel: "Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one finish or style before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this finish or style.",
        perOptionStockDescription: "Enter the stock available for each option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    case "sports_fitness":
      return {
        primaryLabel: "Color / Style",
        primaryPlaceholder: "e.g. Black, Team red, Training set",
        secondaryLabel: "Option",
        secondaryPlaceholder: "e.g. Medium, Size 5, Pair",
        secondaryPresetOptions: SPORTS_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact option buyers will choose under this style.",
        sectionDescription: "Add each color or style with its own images, then list the options buyers can choose under it.",
        groupLabel: "Color / Style",
        optionsLabel: "Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one style option before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this style option.",
        perOptionStockDescription: "Enter the stock available for each option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    case "books_media":
      return {
        primaryLabel: "Edition / Cover",
        primaryPlaceholder: "e.g. Standard cover, Collector's edition",
        secondaryLabel: "Format",
        secondaryPlaceholder: "e.g. Paperback, Hardcover, Audio",
        secondaryPresetOptions: BOOKS_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact format buyers will choose.",
        sectionDescription: "Add each edition or cover with its own images, then list the available formats under it.",
        groupLabel: "Edition / Cover",
        optionsLabel: "Formats",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one edition before saving this product.",
        addOptionCta: "Add Format",
        stockSetupDescription: "Choose how stock should work for this edition or cover.",
        perOptionStockDescription: "Enter the stock available for each format you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Format Guide",
      };
    case "toys_games":
      return {
        primaryLabel: "Theme / Color",
        primaryPlaceholder: "e.g. Dino, Princess, Blue",
        secondaryLabel: "Set / Option",
        secondaryPlaceholder: "e.g. Starter pack, Large set, Educational kit",
        secondaryPresetOptions: TOYS_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact set or option buyers will choose.",
        sectionDescription: "Add each theme or color with its own images, then list the set or option buyers can choose under it.",
        groupLabel: "Theme / Color",
        optionsLabel: "Sets / Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one theme or color option before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this theme or color.",
        perOptionStockDescription: "Enter the stock available for each set or option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    case "automotive":
      return {
        primaryLabel: "Finish / Type",
        primaryPlaceholder: "e.g. Black, Universal, Premium",
        secondaryLabel: "Compatibility / Option",
        secondaryPlaceholder: "e.g. Left, Right, 12V, Front",
        secondaryPresetOptions: AUTOMOTIVE_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact compatibility or option buyers will choose.",
        sectionDescription: "Add each product type or finish with its own images, then list the matching compatibility options under it.",
        groupLabel: "Finish / Type",
        optionsLabel: "Compatibility / Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one automotive option before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this automotive option.",
        perOptionStockDescription: "Enter the stock available for each compatibility or option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    case "health_wellness":
      return {
        primaryLabel: "Type / Flavor",
        primaryPlaceholder: "e.g. Berry, Capsule, Mint",
        secondaryLabel: "Pack / Option",
        secondaryPlaceholder: "e.g. 30 capsules, 100ml, Pack of 2",
        secondaryPresetOptions: HEALTH_VARIANT_OPTIONS,
        secondaryDescription: "Add the exact pack or option buyers will choose.",
        sectionDescription: "Add each product type or flavor with its own images, then list the packs or options buyers can choose under it.",
        groupLabel: "Type / Flavor",
        optionsLabel: "Packs / Options",
        emptyStateLabel: "No product options created yet",
        emptyStateDescription: "Add at least one product option before saving this product.",
        addOptionCta: "Add Option",
        stockSetupDescription: "Choose how stock should work for this type or flavor.",
        perOptionStockDescription: "Enter the stock available for each pack or option you added.",
        supportsSizeGuide: false,
        sizeGuideLabel: "Option Guide",
      };
    default:
      return DEFAULT_VARIANT_CONFIG;
  }
}

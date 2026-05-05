import { ProductWizard } from "./wizard";
import { createProduct } from "./actions";

export default function NewProductPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">פרוייקט חדש</h1>
      <p className="text-sm text-neutral-500 mb-8">
        ויזארד יצירת פרוייקט. ה-API key נוצר אוטומטית ויוצג פעם אחת בלבד.
      </p>

      <ProductWizard action={createProduct} />
    </div>
  );
}

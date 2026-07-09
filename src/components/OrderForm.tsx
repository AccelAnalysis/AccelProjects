import { FormEvent, useState } from "react";
import { Save } from "lucide-react";
import type { Order, OrderInput } from "../types";
import { createOrder, services } from "../data/api";

type OrderFormProps = {
  onSaved: (order: Order) => void;
};

const initialForm: OrderInput = {
  customerName: "",
  email: "",
  phone: "",
  service: services[0].name,
  amount: services[0].amount,
  smsConsent: false
};

export function OrderForm({ onSaved }: OrderFormProps) {
  const [form, setForm] = useState<OrderInput>(initialForm);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof OrderInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateSmsConsent(checked: boolean) {
    setForm((current) => ({ ...current, smsConsent: checked }));
  }

  function updateService(serviceName: string) {
    const selectedService = services.find((service) => service.name === serviceName) ?? services[0];
    setForm((current) => ({
      ...current,
      service: selectedService.name,
      amount: selectedService.amount
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage("");

    try {
      const order = await createOrder(form);
      setForm(initialForm);
      setStatusMessage(`Order created: ${order.id}`);
      onSaved(order);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Order could not be created");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <div className="panel-header">
        <div>
          <h1>Customer Order</h1>
          <p>Create a local mock order. No outside services are connected.</p>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Customer name
          <input value={form.customerName} onChange={(event) => updateField("customerName", event.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} required />
        </label>
        <label>
          Phone
          <input type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} required />
        </label>
        <label>
          Service
          <select value={form.service} onChange={(event) => updateService(event.target.value)} required>
            {services.map((service) => (
              <option key={service.name} value={service.name}>
                {service.name} - ${service.amount}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price
          <input value={`$${form.amount}`} readOnly />
        </label>
        <label className="checkbox-label full-width">
          <input
            checked={form.smsConsent}
            type="checkbox"
            onChange={(event) => updateSmsConsent(event.target.checked)}
          />
          I agree to receive text messages about this order.
        </label>
      </div>

      <button className="primary-button" type="submit">
        <Save size={18} aria-hidden="true" />
        {isSubmitting ? "Submitting..." : "Submit Order"}
      </button>
      {statusMessage ? <p className="form-status">{statusMessage}</p> : null}
    </form>
  );
}

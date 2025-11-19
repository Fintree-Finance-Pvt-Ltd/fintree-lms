import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api"; // your axios wrapper

const InventoryAdd = () => {
  const { lan } = useParams();
  const [form, setForm] = useState({
    item_name: "",
    item_category: "",
    item_subcategory: "",
    brand: "",
    model: "",
    sku_code: "",
    description: "",
    quantity: "",
    uom: "KG",
    batch_number: "",
    serial_number: "",
    manufacturing_date: "",
    expiry_date: "",

    purchase_rate: "",
    market_rate: "",
    mrp: "",
    total_value: "",

    warehouse_name: "",
    storage_rack: "",
    storage_section: "",

    quality_status: "Good",
    stock_status: "Available",
  });

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [inventoryList, setInventoryList] = useState([]);
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);

  // fetch inventory for this customer
  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get(`/wctl-ccod/customer/${lan}`);
      const data = res.data?.data || [];

      setInventoryList(data);

      const total = data.reduce(
        (sum, row) => sum + Number(row.total_value || 0),
        0
      );

      setTotalInventoryValue(total);
    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to load inventory items.");
    }
  };

  const requiredFields = [
    "item_name",
    "item_category",
    "quantity",
    "uom",
    "market_rate",
  ];

  // handle input
  const handleChange = (e) => {
    const { name, value } = e.target;

    let val = value;

    // auto calculate total_value
    if (name === "quantity" || name === "market_rate") {
      const qty = name === "quantity" ? value : form.quantity;
      const rate = name === "market_rate" ? value : form.market_rate;

      const total = qty && rate ? Number(qty) * Number(rate) : "";
      setForm((prev) => ({ ...prev, total_value: total }));
    }

    setForm((prev) => ({ ...prev, [name]: val }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // validation
  const validateForm = () => {
    const newErrors = {};

    requiredFields.forEach((f) => {
      if (!form[f] || String(form[f]).trim() === "") {
        newErrors[f] = "This field is required.";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // submit inventory item
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!validateForm()) {
      setMessage("❌ Please fill all required fields.");
      return;
    }

    const payload = {
      lan: lan,
      ...form,
      quantity: Number(form.quantity),
      purchase_rate: form.purchase_rate ? Number(form.purchase_rate) : null,
      market_rate: form.market_rate ? Number(form.market_rate) : null,
      mrp: form.mrp ? Number(form.mrp) : null,
      total_value: form.total_value ? Number(form.total_value) : null,
    };

    try {
      await api.post("/wctl-ccod/add-inventory", payload);

      setMessage("✅ Inventory item added successfully!");
      fetchInventory();

      // reset form
      setForm({
        item_name: "",
        item_category: "",
        item_subcategory: "",
        brand: "",
        model: "",
        sku_code: "",
        description: "",
        quantity: "",
        uom: "KG",
        batch_number: "",
        serial_number: "",
        manufacturing_date: "",
        expiry_date: "",
        purchase_rate: "",
        market_rate: "",
        mrp: "",
        total_value: "",
        warehouse_name: "",
        storage_rack: "",
        storage_section: "",
        quality_status: "Good",
        stock_status: "Available",
      });

    } catch (err) {
      console.error(err);
      setMessage("❌ Failed to add inventory item.");
    }
  };

  // render input
  const renderInput = (label, name, type = "text") => (
    <div className="form-group">
      <label>
        {label}{" "}
        {requiredFields.includes(name) && <span className="req">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        className={errors[name] ? "error-input" : ""}
      />
      {errors[name] && <p className="error-text">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="manual-entry-container">

      <h2>Add Inventory for lan: {lan}</h2>

      {/* ADD INVENTORY FORM */}
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Inventory Details</legend>

          {renderInput("Item Name", "item_name")}
          {renderInput("Category", "item_category")}
          {renderInput("Subcategory", "item_subcategory")}
          {renderInput("Brand", "brand")}
          {renderInput("Model", "model")}
          {renderInput("SKU Code", "sku_code")}
          {renderInput("Description", "description")}

          {renderInput("Quantity", "quantity", "number")}

          <div className="form-group">
            <label>UOM *</label>
            <select name="uom" value={form.uom} onChange={handleChange}>
              <option value="KG">KG</option>
              <option value="MT">MT</option>
              <option value="PCS">PCS</option>
              <option value="BUNDLE">BUNDLE</option>
            </select>
          </div>

          {renderInput("Batch Number", "batch_number")}
          {renderInput("Serial Number", "serial_number")}
          {renderInput("Manufacturing Date", "manufacturing_date", "date")}
          {renderInput("Expiry Date", "expiry_date", "date")}

          {renderInput("Purchase Rate", "purchase_rate", "number")}
          {renderInput("Market Rate", "market_rate", "number")}
          {renderInput("MRP", "mrp", "number")}

          {/* AUTO CALCULATED */}
          {renderInput("Total Value", "total_value", "number")}

          {renderInput("Warehouse Name", "warehouse_name")}
          {renderInput("Storage Rack", "storage_rack")}
          {renderInput("Storage Section", "storage_section")}

          <div className="form-group">
            <label>Quality Status</label>
            <select
              name="quality_status"
              value={form.quality_status}
              onChange={handleChange}
            >
              <option value="Good">Good</option>
              <option value="Damaged">Damaged</option>
              <option value="Hold">Hold</option>
            </select>
          </div>

          <div className="form-group">
            <label>Stock Status</label>
            <select
              name="stock_status"
              value={form.stock_status}
              onChange={handleChange}
            >
              <option value="Available">Available</option>
              <option value="Reserved">Reserved</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </fieldset>

        <button type="submit">Add Inventory Item</button>
      </form>

      {message && <div className="message">{message}</div>}

      {/* INVENTORY TABLE */}
      <fieldset>
        <legend>Inventory List</legend>

        <table className="inv-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>UOM</th>
              <th>Market Rate</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {inventoryList.map((item) => (
              <tr key={item.inventory_id}>
                <td>{item.item_name}</td>
                <td>{item.quantity}</td>
                <td>{item.uom}</td>
                <td>{item.market_rate}</td>
                <td>{item.total_value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Total Inventory Value: ₹{totalInventoryValue.toLocaleString()}</h3>
      </fieldset>

      {/* INLINE CSS FOR UI MATCHING YOUR STYLE */}
      <style>{`
        .manual-entry-container {
          max-width: 900px;
          margin: 2rem auto;
          background: #fafafa;
          padding: 2rem;
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        fieldset {
          border: 1px solid #ddd;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }
        .form-group {
          margin-bottom: 0.9rem;
          display: flex;
          flex-direction: column;
        }
        input, select {
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .error-input {
          border-color: red;
          background-color: #fff0f0;
        }
        table.inv-table {
          width: 100%;
          margin-top: 1rem;
          border-collapse: collapse;
        }
        table.inv-table th, table.inv-table td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        table.inv-table th {
          background: #f3f4f6;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
};

export default InventoryAdd;

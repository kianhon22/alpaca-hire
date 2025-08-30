"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, deleteDoc, doc, getDocs, query, where, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ConfigurationPage() {
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState({ name: "", managerId: "", active: true });

  const [managers, setManagers] = useState([]);
  const [pendingChanges, setPendingChanges] = useState({}); // { [deptId]: { managerId?, active? } }

  useEffect(() => {
    const load = async () => {
      try {
        const ds = await getDocs(collection(db, "departments"));
        setDepartments(ds.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {}

      try {
        const qy = query(collection(db, "users"), where("role", "==", "departmentManager"));
        const ms = await getDocs(qy);
        setManagers(ms.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {}
    };
    load();
  }, []);

  const addDepartment = async (e) => {
    e.preventDefault();
    if (!newDept.name) return;
    const ref = await addDoc(collection(db, "departments"), {
      name: newDept.name,
      managerId: newDept.managerId || null,
      active: true, // always active on create
      createdAt: new Date(),
    });
    if (newDept.managerId) {
      await setDoc(doc(db, "users", newDept.managerId), { departmentId: ref.id }, { merge: true });
    }
    setNewDept({ name: "", managerId: "", active: true });
    const ds = await getDocs(collection(db, "departments"));
    setDepartments(ds.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const removeDepartment = async (id) => {
    await deleteDoc(doc(db, "departments", id));
    setDepartments((x) => x.filter((d) => d.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* <div className="rounded-xl bg-gradient-to-r from-[#2b99ff] to-[#7fc4ff] text-white p-3"> */}
      <div className="rounded-xl text-[#2b99ff]">
        <h1 className="text-3xl font-bold">Configuration</h1>
        {/* <p className="opacity-90">Manage departments and department managers</p> */}
      </div>

      {/* Departments */}
      {/* Removed standalone add form; add inline in the table below */}

      {/* Departments & Managers table (edit managers and status) */}
      <section className="bg-white border rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Departments & Managers</h2>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[700px] w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">Department</th>
                <th className="text-left p-2 border">Manager</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>              
              {departments.map((d)=>(
                <tr key={d.id}>
                  <td className="p-2 border">
                    <input
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={(pendingChanges[d.id]?.name ?? d.name) || ""}
                      onChange={(e)=>setPendingChanges(prev=>({ ...prev, [d.id]: { ...prev[d.id], name: e.target.value } }))}
                    />
                  </td>
                  <td className="p-2 border">
                    <Select
                      value={(pendingChanges[d.id]?.managerId ?? d.managerId) || ""}
                      onValueChange={(val)=>setPendingChanges(prev=>({ ...prev, [d.id]: { ...prev[d.id], managerId: val } }))}
                    >
                      <SelectTrigger className="w-[240px]">
                        <SelectValue placeholder="Assign manager (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {managers.map((m)=>(
                          <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 border">
                    <label className="text-xs flex items-center gap-1">
                      <input type="checkbox" checked={!!(pendingChanges[d.id]?.active ?? d.active)} onChange={(e)=>setPendingChanges(prev=>({ ...prev, [d.id]: { ...prev[d.id], active: e.target.checked } }))} />
                      Active
                    </label>
                  </td>
                  <td className="p-2 border">
                    <Button
                      variant="outline"
                      onClick={async ()=>{
                        const change = pendingChanges[d.id] || {};
                        const updates = {};
                        if ("name" in change) updates.name = change.name || d.name;
                        if ("managerId" in change) updates.managerId = change.managerId || null;
                        if ("active" in change) updates.active = !!change.active;
                        if (Object.keys(updates).length) {
                          await setDoc(doc(db, "departments", d.id), updates, { merge: true });
                          if ("managerId" in updates && updates.managerId) {
                            await setDoc(doc(db, "users", updates.managerId), { departmentId: d.id }, { merge: true });
                          }
                        }
                        const ds = await getDocs(collection(db, "departments"));
                        setDepartments(ds.docs.map((x) => ({ id: x.id, ...x.data() })));
                        setPendingChanges(prev=>{ const { [d.id]:_, ...rest } = prev; return rest; });
                      }}
                    >Save</Button>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="p-2 border">
                  <Input
                    placeholder="Department name"
                    value={newDept.name}
                    onChange={(e) => setNewDept((d) => ({ ...d, name: e.target.value }))}
                    className="bg-white"
                  />
                </td>
                <td className="p-2 border">
                  <Select value={newDept.managerId} onValueChange={(v)=>setNewDept(d=>({ ...d, managerId: v }))}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue placeholder="Assign manager (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {managers.map((m)=>(
                        <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2 border align-middle text-sm text-gray-600">Active</td>
                <td className="p-2 border">
                  <Button onClick={addDepartment} className="bg-[#2b99ff] hover:bg-blue-600 cursor-pointer">Add</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}




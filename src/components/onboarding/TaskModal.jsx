'use client';

import TaskFormModal from './TaskFormModal';
import Upload from './Upload';

export default function TaskModal(props) {
  const { open, task } = props;
  if (!open) return null;

  const kind = task?.kind;
  const isForm = kind === 'personal_details' || kind === 'bank_info';
  const isUpload = kind === 'signed_contract' || kind === 'id_tax';

  if (isForm) return <TaskFormModal {...props} />;
  if (isUpload) return <Upload {...props} />;

  return null;
}

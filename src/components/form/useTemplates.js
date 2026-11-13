import { useState } from 'react';
import { Alert } from 'react-native';
import { deleteTemplate, markTemplateUsed, saveTemplate } from '../../db/templates';
import { applyTemplate, templateNameFor } from '../../domain/transactionForm';
import { validateTemplateForm } from '../../domain/validation';
import { showError, showMessage } from '../../utils/notify';
import { templateLabel } from './TemplateBar';

/**
 * The add form's saved templates: use one, delete one (asks first), or save
 * the form as a new one. setForm / setErrors are the form's own state setters.
 */
export function useTemplates({ db, templates, form, setForm, setErrors, categories }) {
  const [templateList, setTemplateList] = useState(templates ?? []);

  function pickTemplate(template) {
    setForm((current) => applyTemplate(current, template));
    setErrors({});
    markTemplateUsed(db, template.id).catch((error) => console.error(error));
  }

  function confirmDeleteTemplate(template) {
    Alert.alert(
      'Delete template?',
      `"${templateLabel(template)}" will be removed. Your saved transactions are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTemplate(db, template.id);
              setTemplateList((current) => current.filter((item) => item.id !== template.id));
            } catch (error) {
              showError('Could not delete template', error);
            }
          },
        },
      ],
    );
  }

  async function saveFormAsTemplate() {
    const result = validateTemplateForm(form);
    if (!result.template) {
      setErrors((current) => ({ ...current, ...result.errors }));
      return;
    }
    const categoryName = categories.find((category) => category.id === result.template.categoryId)?.name ?? '';
    const name = templateNameFor(result.template, categoryName);
    try {
      const saved = await saveTemplate(db, { ...result.template, name });
      setTemplateList((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      showMessage(`Template "${saved.name}" saved`);
    } catch (error) {
      showError('Could not save template', error);
    }
  }

  return { templateList, pickTemplate, confirmDeleteTemplate, saveFormAsTemplate };
}

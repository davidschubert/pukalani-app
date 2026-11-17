<script setup lang="ts">
import { createCourseSchema } from '../../schemas/course'
import { COURSE_ACCESS, type CourseAccess, type CourseManageResponse, type CourseRow } from '../../shared/types/course'

/**
 * Kurs ANLEGEN — eine Fassung für beide Einstiege (Dashboard-Tabelle und
 * öffentliche Kurs-Galerie).
 *
 * WARUM GETEILT (Davids Entscheidung zum ersten F58-Entwurf): dort verlinkte
 * die Galerie nach `/dashboard/courses?new=1`. Der Einstieg war damit sichtbar,
 * die Handlung aber weiterhin woanders. Geteilt gehört der MECHANISMUS, nicht
 * der Einstieg — derselbe Schnitt wie bei `EventFormModal`.
 *
 * NUR ANLEGEN, KEIN BEARBEITEN — und das ist der Unterschied zu den Terminen,
 * nicht eine halbe Umsetzung: ein Kurs wird in einer BUILDER-SEITE aufgebaut
 * (`/dashboard/courses/:id`, Lektionen, Reihenfolge, Veröffentlichen). Das in
 * einen Dialog zu zwingen wäre schlechter, nicht konsequenter. „Kurs
 * bearbeiten" auf der Detailseite bleibt deshalb bewusst ein LINK dorthin.
 *
 * Auch nach dem Anlegen geht es in den Builder: ein Kurs ohne Lektionen ist
 * eine leere Hülle. Den Sprung macht der AUFRUFER (`created`-Ereignis), damit
 * dieser Dialog nichts über Routen weiß.
 */
const props = withDefaults(defineProps<{
  /**
   * Darf 'paid' gewählt werden? (F13-Muster — `paidAvailable` aus
   * `/api/courses/manage`, dieselbe Wahrheit, die beim Buchen entscheidet.)
   *
   * `undefined` heißt „noch nicht bekannt" und wird beim ersten Öffnen selbst
   * nachgeschlagen. Der Dashboard-Aufrufer hat die Antwort schon und reicht sie
   * durch — die Galerie nicht, und dort dafür bei JEDEM Seitenaufbau eine
   * 100-Zeilen-Liste zu holen wäre Verschwendung für einen Boolean.
   *
   * WARUM ÜBERHAUPT: `access` ist NUR beim Anlegen setzbar (der Builder zeigt
   * es bloß als Badge). Die Option hier wegzulassen wäre kein kleinerer Umfang,
   * sondern ein Kurs, der nie bezahlt werden kann.
   */
  paidAvailable?: boolean
}>(), {
  /**
   * DAS `withDefaults` IST DIE GANZE POINTE, NICHT KOSMETIK (2026-08-16 live
   * erwischt): ein FEHLENDES Boolean-Prop ist in Vue `false`, nicht
   * `undefined` — Boolean-Casting. Ohne diese Zeile war „noch nicht bekannt"
   * nie erreichbar, der Nachschlag lief nie, und in der Galerie fehlte „Bezahlt"
   * dauerhaft, obwohl der Server `paidAvailable: true` meldete. Der Fehler ist
   * still: es gibt keine Warnung, nur eine Option weniger.
   */
  paidAvailable: undefined,
})

const emit = defineEmits<{ created: [course: CourseRow] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

const saving = ref(false)
const form = reactive({ title: '', slug: '', description: '', access: 'members' as CourseAccess, entitlementProduct: '' })

/** Slug-Vorschlag aus dem Titel (editierbar) */
watch(() => form.title, (title) => {
  if (!form.slug || form.slug === slugify(form.title.slice(0, -1))) form.slug = slugify(title)
})
function slugify(value: string): string {
  return value.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

/**
 * Selbst nachgeschlagener Wert, wenn der Aufrufer keinen mitbringt — einmal je
 * Komponente, erst beim Öffnen. Fehlschlag bleibt `undefined` und damit
 * fail-closed: 'paid' fehlt, statt eine Option anzubieten, die beim Buchen 403t.
 */
const fetchedPaidAvailable = ref<boolean | undefined>(undefined)
const paidAvailable = computed(() => props.paidAvailable ?? fetchedPaidAvailable.value ?? false)

watch(open, async (isOpen) => {
  if (!isOpen) return
  Object.assign(form, { title: '', slug: '', description: '', access: 'members', entitlementProduct: '' })
  if (props.paidAvailable !== undefined || fetchedPaidAvailable.value !== undefined) return
  try {
    const res = await $fetch<CourseManageResponse>('/api/courses/manage')
    fetchedPaidAvailable.value = res.paidAvailable === true
  }
  catch {
    // fail-closed, s. oben
  }
})

/**
 * Zugang ist eine Auswahl, kein Knopf-Paar (Audit-Befund C12): `URadioGroup`
 * bringt Tastaturbedienung und Vorlesbarkeit mit, ein Trio aus UButton nicht.
 *
 * ZWEI ZUGANGSARTEN (KU1, Davids Entscheidung 2026-11-16): „Kostenlos" und
 * „Mitglieder" verlangten beide die Mitgliedschaft und sind eine Auswahl
 * geworden. Wo diese Instanz nichts verkauft, bleibt genau eine übrig — die
 * Gruppe steht dann trotzdem da und sagt, für wen der Kurs ist.
 */
const accessItems = computed(() => COURSE_ACCESS
  .filter(value => value !== 'paid' || paidAvailable.value)
  .map(value => ({
    label: t(`courses.access.${value}`),
    value,
  })))

async function save() {
  const payload = {
    title: form.title,
    slug: form.slug,
    description: form.description,
    access: form.access,
    entitlementProduct: form.access === 'paid' ? (form.entitlementProduct.trim() || null) : null,
  }
  const parsed = createCourseSchema(t).safeParse(payload)
  if (!parsed.success) {
    toast.add({ title: parsed.error.issues[0]?.message ?? t('courses.admin.saveFailed'), color: 'error' })
    return
  }
  saving.value = true
  try {
    const row = await $fetch<CourseRow>('/api/courses', { method: 'POST', body: parsed.data })
    toast.add({ title: t('courses.admin.created'), description: t('courses.admin.createdHint'), color: 'success' })
    open.value = false
    emit('created', row)
  }
  catch (error) {
    // Die belegte Adresse ist der einzige Grund, den der Server namentlich
    // meldet — und der einzige, gegen den man selbst etwas tun kann.
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('courses.admin.slugTaken') : t('courses.admin.saveFailed'),
      description: statusCode === 409 ? t('courses.admin.slugTakenHint') : t('courses.admin.courseSaveFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('courses.admin.createTitle')">
    <template #body>
      <form class="space-y-4" data-testid="course-form" @submit.prevent="save">
        <UFormField :label="t('courses.admin.form.title')" required>
          <UInput v-model="form.title" class="w-full" :maxlength="200" data-testid="course-form-title" />
        </UFormField>
        <UFormField :label="t('courses.admin.form.slug')" :help="t('courses.admin.form.slugHelp')" required>
          <UInput v-model="form.slug" class="w-full" :maxlength="100" data-testid="course-form-slug" />
        </UFormField>
        <UFormField :label="t('courses.admin.form.description')" :help="t('courses.admin.form.markdownHelp')" required>
          <UTextarea v-model="form.description" class="w-full" :rows="4" />
        </UFormField>
        <UFormField :label="t('courses.admin.form.access')">
          <URadioGroup
            v-model="form.access"
            :items="accessItems"
            value-key="value"
            orientation="horizontal"
            :ui="{ fieldset: 'gap-x-6 gap-y-2 flex-wrap' }"
            data-testid="course-form-access"
          />
        </UFormField>
        <UFormField
          v-if="form.access === 'paid'"
          :label="t('courses.admin.form.entitlement')"
          :help="t('courses.admin.form.entitlementHelp')"
          required
        >
          <!-- Der Platzhalter war der interne Key `paidCourses` (Audit-Befund
               C12) — eine Ausfüllhilfe, die nur versteht, wer den Code kennt.
               Das Beispiel steht weiter im Hilfetext, der Platzhalter sagt
               jetzt, WORAUS der Wert kommt. -->
          <UInput
            v-model="form.entitlementProduct"
            class="w-full"
            :maxlength="64"
            :placeholder="t('courses.admin.form.entitlementPlaceholder')"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="ghost" @click="() => { open = false }">{{ t('ui.cancel') }}</UButton>
          <UButton type="submit" :loading="saving" data-testid="course-form-save">{{ t('courses.admin.form.save') }}</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

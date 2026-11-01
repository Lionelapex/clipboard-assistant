(function () {
  const { createApp, ref, computed } = Vue;

  createApp({
    setup() {
      const subject = ref('');
      const body = ref('');
      const extras = ref([]);
      const total = computed(() => subject.value.length + body.value.length);

      return {
        subject,
        body,
        extras,
        total,
        addExtra: () => extras.value.push(extras.value.length + 1),
      };
    },
    template: `
      <div>
        <h2>New request</h2>
        <label for="vue-subject">Subject</label>
        <input id="vue-subject" v-model="subject" placeholder="Short summary" />

        <label for="vue-body">Description</label>
        <textarea id="vue-body" rows="6" v-model="body" placeholder="Describe the request"></textarea>

        <p class="count" data-testid="vue-count">{{ total }} characters in Vue state</p>

        <button type="button" @click="addExtra">Add field</button>

        <div v-for="n in extras" :key="n">
          <label :for="'vue-extra-' + n">Extra note {{ n }}</label>
          <textarea :id="'vue-extra-' + n" :data-testid="'vue-extra-' + n" rows="3"></textarea>
        </div>
      </div>
    `,
  }).mount('#app');
})();

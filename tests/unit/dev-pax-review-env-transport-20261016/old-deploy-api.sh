IMAGE="${{ needs.prepare.outputs.registry }}/api:${{ needs.build-push.outputs.image_tag }}"
api_secrets="${{ steps.api_secrets.outputs.api }}"
passenger_secrets="${{ steps.passenger_secrets.outputs.api }}"
if [[ -n "$passenger_secrets" ]]; then
  api_secrets="${api_secrets},${passenger_secrets}"
fi

operations/deployment/deploy-cloud-run-service.sh "${{ needs.prepare.outputs.api_service }}" \
  --region "${{ needs.prepare.outputs.region }}" \
  --image "$IMAGE" \
  --port 3001 \
  --ingress all \
  --set-cloudsql-instances "${{ needs.prepare.outputs.cloudsql }}" \
  --service-account "${{ needs.prepare.outputs.runtime_service_account }}" \
  --set-secrets "$api_secrets" \
  --set-env-vars "${{ steps.api_env.outputs.vars }}" \
  ${{ needs.prepare.outputs.api_exposure_flag }} \
  --min-instances 0 \
  --max-instances 1 \
  --project "${{ needs.prepare.outputs.project_id }}"

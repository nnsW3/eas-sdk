import { Base, SignerOrProvider } from './base';
import { getUUIDFromAttestTx, ZERO_BYTES32 } from './utils';
import { EAS__factory, EAS as EASContract } from '@ethereum-attestation-service/eas-contracts';
import { BigNumberish, BytesLike, ContractTransaction, Signature } from 'ethers';

export interface Attestation {
  uuid: string;
  schema: string;
  refUUID: string;
  time: number;
  expirationTime: number;
  revocationTime: number;
  recipient: string;
  revocable: boolean;
  attester: string;
  data: string;
}

export const NO_EXPIRATION = 0;

export interface AttestationRequestData {
  recipient: string;
  data: BytesLike;
  expirationTime?: number;
  revocable?: boolean;
  refUUID?: string;
  value?: BigNumberish;
}

export interface AttestationRequest {
  schema: string;
  data: AttestationRequestData;
}

export interface DelegatedAttestationRequest extends AttestationRequest {
  signature: Signature;
  attester: string;
}

export interface RevocationRequestData {
  uuid: string;
  value?: BigNumberish;
}

export interface RevocationRequest {
  schema: string;
  data: RevocationRequestData;
}

export interface DelegatedRevocationRequest extends RevocationRequest {
  signature: Signature;
  revoker: string;
}

export interface GetAttestationParams {
  uuid: string;
}

export interface IsAttestationValidParams {
  uuid: string;
}

export interface IsAttestationRevokedParams {
  uuid: string;
}

export class EAS extends Base<EASContract> {
  constructor(address: string, signerOrProvider?: SignerOrProvider) {
    super(new EAS__factory(), address, signerOrProvider);
  }

  // Attests to a specific schema
  public async attest({
    schema,
    data: { recipient, data, expirationTime = NO_EXPIRATION, revocable = true, refUUID = ZERO_BYTES32, value = 0 }
  }: AttestationRequest): Promise<string> {
    const res = await this.contract.attest(
      { schema, data: { recipient, expirationTime, revocable, refUUID, data, value } },
      {
        value
      }
    );

    return getUUIDFromAttestTx(res);
  }

  // Attests to a specific schema via an EIP712 delegation request
  public async attestByDelegation({
    schema,
    data: { recipient, data, expirationTime = NO_EXPIRATION, revocable = true, refUUID = ZERO_BYTES32, value = 0 },
    attester,
    signature
  }: DelegatedAttestationRequest): Promise<string> {
    const res = await this.contract.attestByDelegation(
      {
        schema,
        data: {
          recipient,
          expirationTime,
          revocable,
          refUUID,
          data,
          value
        },
        signature,
        attester
      },
      { value }
    );
    const receipt = await res.wait();

    const event = receipt.events?.find((e) => e.event === 'Attested');
    if (!event) {
      throw new Error('Unable to process attestation event');
    }

    return event.args?.uuid;
  }

  // Revokes an existing attestation
  public async revoke({ schema, data: { uuid, value = 0 } }: RevocationRequest): Promise<ContractTransaction> {
    return this.contract.revoke({ schema, data: { uuid, value } }, { value });
  }

  // Revokes an existing attestation an EIP712 delegation request
  public async revokeByDelegation({
    schema,
    data: { uuid, value = 0 },
    signature,
    revoker
  }: DelegatedRevocationRequest): Promise<ContractTransaction> {
    return this.contract.revokeByDelegation(
      {
        schema,
        data: {
          uuid,
          value
        },
        signature,
        revoker
      },
      { value }
    );
  }

  // Returns an existing schema by attestation UUID
  public async getAttestation({ uuid }: GetAttestationParams): Promise<Attestation> {
    return this.contract.getAttestation(uuid);
  }

  // Returns whether an attestation is valid
  public async isAttestationValid({ uuid }: IsAttestationValidParams): Promise<boolean> {
    return this.contract.isAttestationValid(uuid);
  }

  // Returns whether an attestation has been revoked
  public async isAttestationRevoked({ uuid }: IsAttestationRevokedParams): Promise<boolean> {
    const attestation = await this.contract.getAttestation(uuid);
    if (attestation.uuid === ZERO_BYTES32) {
      throw new Error('Invalid attestation');
    }

    return attestation.revocationTime != 0;
  }
}
